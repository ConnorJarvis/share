package main

import (
	"errors"
	"html/template"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

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
	redisAddress  string
	redisPassword string
	redisDB       int
	redisClient   *redis.Client
	cdnDomain     string
}

func main() {
	config := &Configuration{}
	//Check if in production
	if os.Getenv("prod") == "TRUE" {
		config.production = true
		config.csrfSecure = true
	}
	//Pre-parse all templates
	err = parseTemplates()
	if err != nil {
		log.Fatal(err)
	}
	//Retrieve configuration
	if config.production {
		err = config.getProductionConfig()
		if err != nil {
			log.Fatal(err)
		}
	} else {
		err = config.getDevelopmentConfig()
		if err != nil {
			log.Fatal(err)
		}
	}

	r := mux.NewRouter()
	// Serve files from the static folder
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("."+"/static/"))))
	// Path to handle requesting uploadURLs
	r.HandleFunc("/upload/geturl", config.uploadRequest).Methods("POST")
	// Path to handle the index/upload
	r.HandleFunc("/", config.upload)
	//Path that serves the download page
	r.HandleFunc("/download/{id}/", config.download)
	// Wrap http listener with csrf middleware
	http.ListenAndServe(":8000",
		csrf.Protect(
			[]byte(config.csrfKey),
			csrf.Secure(config.csrfSecure),
			csrf.FieldName("csrf"),
		)(r))

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
	secretValues, err := client.Logical().Read("secret/share")
	if err != nil {
		return err
	}
	c.csrfKey = secretValues.Data["csrf_key"].(string)
	c.s3Endpoint = secretValues.Data["s3_endpoint"].(string)
	c.s3AccessKey = secretValues.Data["s3_access_key"].(string)
	c.s3SecretKey = secretValues.Data["s3_secret_key"].(string)
	c.s3Bucket = secretValues.Data["s3_bucket"].(string)
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
	return nil
}

//getDevelopmentConfig is used to retrieve the configuration from the env
func (c *Configuration) getDevelopmentConfig() error {
	var set bool
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
