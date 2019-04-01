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
)

var Production bool

func init() {
	if os.Getenv("PROD") == "TRUE" {
		Production = true
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

}

func main() {
	var authKey string
	var csrfSecure bool

	if Production {
		//TODO
	} else {
		csrfSecure = false
		authKey = "xxksOwPHS6hL4SqYJ0oT4AbKZbAwQdLh3yfmRZHk1U8="
	}

	r := mux.NewRouter()
	// Paths to handle registering
	r.HandleFunc("/upload/post", handleUpload).Methods("POST")

	r.HandleFunc("/", index)
	// Wrap http listener with csrf middleware
	http.ListenAndServe(":8000",
		csrf.Protect(
			[]byte(authKey),
			csrf.Secure(csrfSecure),
			csrf.FieldName("csrf"),
		)(r))

}
