package main

import (
	"fmt"
	"html/template"
	"io/ioutil"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-redis/redis"
	"github.com/gorilla/csrf"
	"github.com/gorilla/mux"
	"github.com/hashicorp/vault/api"
)

var config *Configuration
var err error

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

func init() {
	config = &Configuration{}
	if os.Getenv("prod") == "TRUE" {
		config.production = true
		config.csrfSecure = true
	}

	// Pre-parse all templates
	var allFiles []string
	files, err := ioutil.ReadDir("./templates")
	if err != nil {
		fmt.Println(err)
	}
	for _, file := range files {
		filename := file.Name()
		if strings.HasSuffix(filename, ".html") {
			allFiles = append(allFiles, "./templates/"+filename)
		}
	}
	templates, err = template.ParseFiles(allFiles...)
	if err != nil {
		fmt.Println(err)
	}

	if config.production {
		err = GetProductionConfig()
		if err != nil {
			fmt.Println(err)
		}
	} else {
		err = GetDevelopmentConfig()
		if err != nil {
			fmt.Println(err)
		}
	}

	config.redisClient = redis.NewClient(&redis.Options{
		Addr:     config.redisAddress,
		Password: config.redisPassword,
		DB:       config.redisDB,
	})

}

func main() {

	r := mux.NewRouter()
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("."+"/static/"))))
	// Paths to handle registering
	r.HandleFunc("/upload/geturl", uploadRequest).Methods("POST")

	r.HandleFunc("/", index)
	r.HandleFunc("/download/{id}/", download)
	// Wrap http listener with csrf middleware
	http.ListenAndServe(":8000",
		csrf.Protect(
			[]byte(config.csrfKey),
			csrf.Secure(config.csrfSecure),
			csrf.FieldName("csrf"),
		)(r))

}

//GetProductionConfig is used to retrieve the configuration from Vault
func GetProductionConfig() error {

	// Connect to Vault
	client, err := api.NewClient(&api.Config{
		Address: os.Getenv("vault_addr"),
	})
	client.SetToken(os.Getenv("vault_token"))

	// Retrieve config
	secretValues, err := client.Logical().Read("secret/share")
	if err != nil {
		return err
	}
	config.csrfKey = secretValues.Data["csrf_key"].(string)
	config.s3Endpoint = secretValues.Data["s3_endpoint"].(string)
	config.s3AccessKey = secretValues.Data["s3_access_key"].(string)
	config.s3SecretKey = secretValues.Data["s3_secret_key"].(string)
	config.s3Bucket = secretValues.Data["s3_bucket"].(string)
	config.cdnDomain = secretValues.Data["cdn_domain"].(string)
	config.redisAddress = secretValues.Data["redis_address"].(string)
	config.redisPassword = secretValues.Data["redis_password"].(string)
	redisDB := secretValues.Data["redis_db"].(string)
	config.redisDB, err = strconv.Atoi(redisDB)
	if err != nil {
		return err
	}
	return nil
}

func GetDevelopmentConfig() error {
	config.csrfKey = os.Getenv("csrf_key")
	config.s3Endpoint = os.Getenv("s3_endpoint")
	config.s3AccessKey = os.Getenv("s3_access_key")
	config.s3SecretKey = os.Getenv("s3_secret_key")
	config.s3Bucket = os.Getenv("s3_bucket")
	config.cdnDomain = os.Getenv("cdn_domain")
	config.redisAddress = os.Getenv("redis_address")
	config.redisPassword = os.Getenv("redis_password")
	redisDB := os.Getenv("redis_db")
	config.redisDB, err = strconv.Atoi(redisDB)
	if err != nil {
		return err
	}
	return nil
}
