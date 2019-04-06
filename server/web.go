package main

import (
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"time"

	"github.com/davecgh/go-spew/spew"
	"github.com/gorilla/csrf"
	"github.com/minio/minio-go"
)

var templates *template.Template

// index
func index(w http.ResponseWriter, r *http.Request) {
	templates.ExecuteTemplate(w, "index.html", map[string]interface{}{
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
	FileSize int    `json:"fileSize"`
	Metadata string `json:"metadata"`
	ID       string `json:"id"`
}

type UploadRequestResponse struct {
	ID      string `json:"fileID"`
	Url     string `json:"url"`
	UrlMeta string `json:"metaUrl"`
}

//Uploadrequest
func newUpload(w http.ResponseWriter, r *http.Request) {
	decoder := json.NewDecoder(r.Body)
	var u UploadRequest
	err := decoder.Decode(&u)
	if err != nil {
		log.Println(err)
	}
	spew.Dump(u)

	s3Client, err := minio.New(s3Endpoint, s3AccessKey, s3SecretKey, true)
	if err != nil {
		log.Println(err)
	}

	url, err := s3Client.PresignedPutObject(s3Bucket, u.ID, time.Hour)
	if err != nil {
		log.Println(err)
	}
	urlMeta, err := s3Client.PresignedPutObject(s3Bucket, u.ID+"_meta", time.Hour)
	if err != nil {
		log.Println(err)
	}

	response := UploadRequestResponse{ID: u.ID, Url: url.String(), UrlMeta: urlMeta.String()}

	b, err := json.Marshal(response)
	_, err = w.Write(b)
	if err != nil {
		log.Println(err)
	}

}
