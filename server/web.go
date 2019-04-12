package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"

	"github.com/go-redis/redis"
	"github.com/gorilla/csrf"
)

var templates *template.Template

//upload displays the index/upload page
func (c *Configuration) upload(w http.ResponseWriter, r *http.Request) {
	templates.ExecuteTemplate(w, "upload.html", map[string]interface{}{
		csrf.TemplateTag: csrf.TemplateField(r),
		"cdnDomain":      c.cdnDomain,
	})
}

//download displays the download page
func (c *Configuration) download(w http.ResponseWriter, r *http.Request) {
	templates.ExecuteTemplate(w, "download.html", map[string]interface{}{
		"cdnDomain": c.cdnDomain,
	})

}

//UploadRequest is the expected json struct from a client requesting upload urls for an ID
type UploadRequest struct {
	ID string `json:"id"`
}

//UploadRequestResponse is the json struct send to a client in response to a UploadRequest
type UploadRequestResponse struct {
	ID           string         `json:"fileID"`
	FileURL      string         `json:"fileUrl"`
	FileFormData *PresignedPOST `json:"fileFormData"`
	MetaURL      string         `json:"metaUrl"`
	MetaFormData *PresignedPOST `json:"metaFormData"`
	Error        int            `json:"error"`
}

//uploadRequest responds to requests for uploadURLs for a specfified ID
func (c *Configuration) uploadRequest(w http.ResponseWriter, r *http.Request) {
	//Decode the body into a UploadRequest struct
	decoder := json.NewDecoder(r.Body)
	var u UploadRequest
	err := decoder.Decode(&u)
	if err != nil {
		log.Println(err)
	}
	//Check if the fileID is already in use
	_, err = c.redisClient.Get(u.ID).Result()
	if err != redis.Nil {
		//fileID is already in use so respond with Error: 1
		response := UploadRequestResponse{Error: 1}
		b, err := json.Marshal(response)
		_, err = w.Write(b)
		if err != nil {
			log.Println(err)
		}
		return
	}
	//Set the fileID as in use
	err = c.redisClient.Set(u.ID, "", 0).Err()
	if err != nil {
		log.Println(err)
	}

	//Create a PostPolicy for the file
	//1GB max size, 1 hour to upload
	fileFormData, err := NewPresignedPOST(u.ID, &Credentials{Region: "us-east-1", Bucket: c.s3Bucket, AccessKeyID: c.s3AccessKey, SecretAccessKey: c.s3SecretKey}, &PolicyOptions{ExpiryMinutes: 60, MaxFileSize: 1024 * 1024 * 1024})
	if err != nil {
		log.Println(err)
	}
	fileURL := fmt.Sprintf("https://%s/%s/", c.s3Endpoint, c.s3Bucket)

	//Create a PostPolicy for the metadata
	//5KB max size, 1 minute to upload
	metaFormData, err := NewPresignedPOST(u.ID+"_meta", &Credentials{Region: "us-east-1", Bucket: c.s3Bucket, AccessKeyID: c.s3AccessKey, SecretAccessKey: c.s3SecretKey}, &PolicyOptions{ExpiryMinutes: 1, MaxFileSize: 5120})
	if err != nil {
		log.Println(err)
	}

	// Create a UploadRequestResponse with relevant data
	response := UploadRequestResponse{ID: u.ID, FileURL: fileURL, FileFormData: fileFormData, MetaURL: fileURL, MetaFormData: metaFormData, Error: 0}
	b, err := json.Marshal(response)
	//Send UploadRequestResponse marshaled to json
	_, err = w.Write(b)
	if err != nil {
		log.Println(err)
	}

}
