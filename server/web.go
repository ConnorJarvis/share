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
		"cdnDomain":      cdnDomain,
	})

}

func download(w http.ResponseWriter, r *http.Request) {
	templates.ExecuteTemplate(w, "download.html", map[string]interface{}{
		"cdnDomain": cdnDomain,
	})

}

type UploadRequest struct {
	ID string `json:"id"`
}

type UploadRequestResponse struct {
	ID           string            `json:"fileID"`
	FileUrl      string            `json:"fileUrl"`
	FileFormData map[string]string `json:"fileFormData"`
	MetaUrl      string            `json:"metaUrl"`
	MetaFormData map[string]string `json:"metaFormData"`
	Error        int               `json:"error"`
}

//Uploadrequest
func newUpload(w http.ResponseWriter, r *http.Request) {
	decoder := json.NewDecoder(r.Body)
	var u UploadRequest
	err := decoder.Decode(&u)
	if err != nil {
		log.Println(err)
	}
	_, err = redisClient.Get(u.ID).Result()
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
	err = redisClient.Set(u.ID, "used", 0).Err()
	if err != nil {
		log.Println(err)
	}

	s3Client, err := minio.New(s3Endpoint, s3AccessKey, s3SecretKey, true)
	if err != nil {
		log.Println(err)
	}

	policy := minio.NewPostPolicy()
	policy.SetBucket(s3Bucket)
	policy.SetKey(u.ID)
	policy.SetContentLengthRange(1, 1024*1024*1024)
	policy.SetExpires(time.Now().UTC().Add(time.Hour))
	fileUrl, fileFormData, err := s3Client.PresignedPostPolicy(policy)
	if err != nil {
		log.Println(err)
	}

	policy = minio.NewPostPolicy()
	policy.SetBucket(s3Bucket)
	policy.SetKey(u.ID + "_meta")
	policy.SetContentLengthRange(1, 5000)
	policy.SetExpires(time.Now().UTC().Add(time.Hour))
	metaUrl, metaFormData, err := s3Client.PresignedPostPolicy(policy)
	if err != nil {
		log.Println(err)
	}

	response := UploadRequestResponse{ID: u.ID, FileUrl: fileUrl.String(), FileFormData: fileFormData, MetaUrl: metaUrl.String(), MetaFormData: metaFormData, Error: 0}

	b, err := json.Marshal(response)
	_, err = w.Write(b)
	if err != nil {
		log.Println(err)
	}

}
