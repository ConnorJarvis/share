package main

import (
	"fmt"
	"html/template"
	"io/ioutil"
	"net/http"
	"os"
	"strings"

	"github.com/gorilla/csrf"
	"github.com/gorilla/mux"
	"github.com/hashicorp/vault/api"
)

var production bool

//CSRF Variables
var csrfKey string
var csrfSecure bool

//S3 Settings
var s3Endpoint string
var s3AccessKey string
var s3SecretKey string
var s3Bucket string

var cdnDomain string

func init() {
	if os.Getenv("PROD") == "TRUE" {
		production = true
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

	if production {
		csrfSecure = true
	} else {
		csrfSecure = false
	}
	csrfKey, s3Endpoint, s3AccessKey, s3SecretKey, s3Bucket, cdnDomain, err = GetConfig()
	if err != nil {
		fmt.Println(err)
	}

}

func main() {

	r := mux.NewRouter()
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("."+"/static/"))))
	// Paths to handle registering
	r.HandleFunc("/upload/geturl", newUpload).Methods("POST")

	r.HandleFunc("/", index)
	r.HandleFunc("/download/{id}/", download)
	// Wrap http listener with csrf middleware
	http.ListenAndServe(":8000",
		csrf.Protect(
			[]byte(csrfKey),
			csrf.Secure(csrfSecure),
			csrf.FieldName("csrf"),
		)(r))

}

func GetConfig() (string, string, string, string, string, string, error) {
	// Connect to Vault
	client, err := api.NewClient(&api.Config{
		Address: os.Getenv("VAULT_ADDR"),
	})
	client.SetToken(os.Getenv("VAULT_TOKEN"))

	// Retrieve config
	secretValues, err := client.Logical().Read("secret/share")
	if err != nil {
		return "", "", "", "", "", "", err
	}
	csrfKey := secretValues.Data["csrf_key"].(string)
	s3Endpoint := secretValues.Data["s3_endpoint"].(string)
	s3AccessKey := secretValues.Data["s3_access_key"].(string)
	s3SecretKey := secretValues.Data["s3_secret_key"].(string)
	s3Bucket := secretValues.Data["s3_bucket"].(string)
	cdnDomain := secretValues.Data["cdn_domain"].(string)
	return csrfKey, s3Endpoint, s3AccessKey, s3SecretKey, s3Bucket, cdnDomain, nil
}
