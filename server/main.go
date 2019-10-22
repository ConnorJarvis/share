package main

import (
	"context"
	"errors"
	"html/template"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"time"

	"github.com/ConnorJarvis/go-backblaze"
	"github.com/go-redis/redis"
	"github.com/gorilla/csrf"
	"github.com/gorilla/mux"
	"github.com/hashicorp/vault/api"
)

var err error

//Configuration defines all variables needed to operate the service
type Configuration struct {
	production    bool
	csrfKey       string
	csrfSecure    bool
	s3Endpoint    string
	s3AccessKey   string
	s3SecretKey   string
	s3Bucket      string
	s3Region      string
	redisAddress  string
	redisPassword string
	redisDB       int
	redisClient   *redis.Client
	cdnDomain     string
	b2AccountID   string
	b2AccountKey  string
	b2Client      *backblaze.B2
}

func main() {

	server, err := startServer()
	if err != nil {
		log.Fatal(err)
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	// Waiting for SIGINT (pkill -2)
	<-stop

	ctx, _ := context.WithTimeout(context.Background(), 5*time.Second)
	if err := server.Shutdown(ctx); err != nil {
		log.Println(err)
	}
}

func startServer() (*http.Server, error) {
	config := &Configuration{}
	//Check if in production
	if os.Getenv("prod") == "TRUE" {
		config.production = true
		config.csrfSecure = true
	}
	//Pre-parse all templates
	err = parseTemplates()
	if err != nil {
		return nil, err
	}
	//Retrieve configuration
	if config.production {
		err = config.getProductionConfig()
		if err != nil {
			return nil, err
		}
	} else {
		err = config.getDevelopmentConfig()
		if err != nil {
			return nil, err
		}
	}

	r := mux.NewRouter()
	// Serve files from the static folder
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("."+"/static/"))))
	// Path to handle requesting uploadURLs
	r.HandleFunc("/upload/geturl", config.uploadRequest).Methods("POST")

	r.HandleFunc("/upload/getuploadparturl", config.UploadPartRequest).Methods("POST")

	r.HandleFunc("/upload/completeupload", config.UploadFileComplete).Methods("POST")
	// Path to handle the index/upload
	r.HandleFunc("/", config.upload)
	//Path that serves the download page
	r.HandleFunc("/download/{id}/", config.download)

	srv := &http.Server{Addr: ":8000", Handler: csrf.Protect(
		[]byte(config.csrfKey),
		csrf.Secure(config.csrfSecure),
		csrf.FieldName("csrf"),
	)(r)}

	go func() {
		// returns ErrServerClosed on graceful close
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("ListenAndServe(): %s", err)
		}
	}()
	return srv, nil
}

func parseTemplates() error {

	var allFiles []string
	files, err := ioutil.ReadDir("./templates")
	if err != nil {
		return err
	}
	for _, file := range files {
		filename := file.Name()
		if strings.HasSuffix(filename, ".html") {
			allFiles = append(allFiles, "./templates/"+filename)
		}
	}
	templates, err = template.ParseFiles(allFiles...)
	if err != nil {
		return err
	}
	return nil
}

//getProductionConfig is used to retrieve the configuration from Vault
func (c *Configuration) getProductionConfig() error {

	// Connect to Vault
	client, err := api.NewClient(&api.Config{
		Address: os.Getenv("vault_addr"),
	})
	if err != nil {
		return err
	}
	client.SetToken(os.Getenv("vault_token"))

	// Retrieve config
	secretValues, err := client.Logical().Read("secret/" + os.Getenv("vault_secret"))
	if err != nil {
		return err
	}
	c.b2AccountID = secretValues.Data["b2_account_id"].(string)
	c.b2AccountKey = secretValues.Data["b2_account_key"].(string)
	c.csrfKey = secretValues.Data["csrf_key"].(string)
	c.s3Endpoint = secretValues.Data["s3_endpoint"].(string)
	c.s3AccessKey = secretValues.Data["s3_access_key"].(string)
	c.s3SecretKey = secretValues.Data["s3_secret_key"].(string)
	c.s3Bucket = secretValues.Data["s3_bucket"].(string)
	c.s3Region = secretValues.Data["s3_region"].(string)
	c.cdnDomain = secretValues.Data["cdn_domain"].(string)
	c.redisAddress = secretValues.Data["redis_address"].(string)
	c.redisPassword = secretValues.Data["redis_password"].(string)
	redisDB := secretValues.Data["redis_db"].(string)
	c.redisDB, err = strconv.Atoi(redisDB)
	if err != nil {
		return err
	}
	err = c.setupRedisClient()
	if err != nil {
		return err
	}
	c.b2Client, err = backblaze.NewB2(backblaze.Credentials{
		AccountID:      c.b2AccountID,
		ApplicationKey: c.b2AccountKey,
	})

	return nil
}

//getDevelopmentConfig is used to retrieve the configuration from the env
func (c *Configuration) getDevelopmentConfig() error {
	var set bool
	c.b2AccountID, set = os.LookupEnv("b2_account_id")
	if set == false {
		return errors.New("b2_account_id not set")
	}
	c.b2AccountKey, set = os.LookupEnv("b2_account_key")
	if set == false {
		return errors.New("b2_account_key not set")
	}
	c.csrfKey, set = os.LookupEnv("csrf_key")
	if set == false {
		return errors.New("csrf_key not set")
	}
	c.s3Endpoint, set = os.LookupEnv("s3_endpoint")
	if set == false {
		return errors.New("s3_endpoint not set")
	}
	c.s3AccessKey, set = os.LookupEnv("s3_access_key")
	if set == false {
		return errors.New("s3_access_key not set")
	}
	c.s3SecretKey, set = os.LookupEnv("s3_secret_key")
	if set == false {
		return errors.New("s3_secret_key not set")
	}
	c.s3Bucket, set = os.LookupEnv("s3_bucket")
	if set == false {
		return errors.New("s3_bucket not set")
	}
	c.s3Region, set = os.LookupEnv("s3_region")
	if set == false {
		return errors.New("s3_region not set")
	}
	c.cdnDomain, set = os.LookupEnv("cdn_domain")
	if set == false {
		return errors.New("cdn_domain not set")
	}
	c.redisAddress, set = os.LookupEnv("redis_address")
	if set == false {
		return errors.New("redis_address not set")
	}
	c.redisPassword, set = os.LookupEnv("redis_password")
	if set == false {
		return errors.New("redis_password not set")
	}
	redisDB, set := os.LookupEnv("redis_db")
	if set == false {
		return errors.New("redis_db not set")
	}
	c.redisDB, err = strconv.Atoi(redisDB)
	if err != nil {
		return err
	}
	err = c.setupRedisClient()
	if err != nil {
		return err
	}
	return nil
}

func (c *Configuration) setupRedisClient() error {
	//Create the redisClient
	c.redisClient = redis.NewClient(&redis.Options{
		Addr:     c.redisAddress,
		Password: c.redisPassword,
		DB:       c.redisDB,
	})
	_, err := c.redisClient.Ping().Result()
	if err != nil {
		return err
	}
	return nil
}
