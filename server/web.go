package main

import (
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"time"

	"github.com/go-redis/redis"
	"github.com/gorilla/csrf"
	"github.com/minio/minio-go"
)

var templates *template.Template

// index
func index(w http.ResponseWriter, r *http.Request) {
	templates.ExecuteTemplate(w, "upload.html", map[string]interface{}{
		csrf.TemplateTag: csrf.TemplateField(r),
		"cdnDomain":      config.cdnDomain,
	})

}

func download(w http.ResponseWriter, r *http.Request) {
	templates.ExecuteTemplate(w, "download.html", map[string]interface{}{
		"cdnDomain": config.cdnDomain,
	})

}

//UploadRequest is the expected json struct from a client requesting upload urls for an ID
type UploadRequest struct {
	ID string `json:"id"`
}

//UploadRequestResponse is the json struct send to a client in response to a UploadRequest
type UploadRequestResponse struct {
	ID           string            `json:"fileID"`
	FileURL      string            `json:"fileUrl"`
	FileFormData map[string]string `json:"fileFormData"`
	MetaURL      string            `json:"metaUrl"`
	MetaFormData map[string]string `json:"metaFormData"`
	Error        int               `json:"error"`
}

//uploadRequest
func uploadRequest(w http.ResponseWriter, r *http.Request) {
	decoder := json.NewDecoder(r.Body)
	var u UploadRequest
	err := decoder.Decode(&u)
	if err != nil {
		log.Println(err)
	}
	_, err = config.redisClient.Get(u.ID).Result()
	log.Println(err)
	if err != redis.Nil {
		response := UploadRequestResponse{Error: 1}

		b, err := json.Marshal(response)
		_, err = w.Write(b)
		if err != nil {
			log.Println(err)
		}
		return
	}
	err = config.redisClient.Set(u.ID, "used", 0).Err()
	if err != nil {
		log.Println(err)
	}

	s3Client, err := minio.New(config.s3Endpoint, config.s3AccessKey, config.s3SecretKey, true)
	if err != nil {
		log.Println(err)
	}

	policy := minio.NewPostPolicy()
	policy.SetBucket(config.s3Bucket)
	policy.SetKey(u.ID)
	policy.SetContentLengthRange(1, 1024*1024*1024)
	policy.SetExpires(time.Now().UTC().Add(time.Hour))
	fileURL, fileFormData, err := s3Client.PresignedPostPolicy(policy)
	if err != nil {
		log.Println(err)
	}

	policy = minio.NewPostPolicy()
	policy.SetBucket(config.s3Bucket)
	policy.SetKey(u.ID + "_meta")
	policy.SetContentLengthRange(1, 5000)
	policy.SetExpires(time.Now().UTC().Add(time.Hour))
	metaURL, metaFormData, err := s3Client.PresignedPostPolicy(policy)
	if err != nil {
		log.Println(err)
	}

	response := UploadRequestResponse{ID: u.ID, FileURL: fileURL.String(), FileFormData: fileFormData, MetaURL: metaURL.String(), MetaFormData: metaFormData, Error: 0}

	b, err := json.Marshal(response)
	_, err = w.Write(b)
	if err != nil {
		log.Println(err)
	}

}
