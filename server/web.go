package main

import (
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/davecgh/go-spew/spew"
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

//UploadRequestResponse is the json struct sent to a client in response to a UploadRequest
type UploadRequestResponse struct {
	ID               string `json:"fileID"`
	FileUploadID     string `json:"fileUploadID"`
	MetaURL          string `json:"metaUrl"`
	SecondaryFileURL string `json:"secondaryFileUrl"`
	Error            int    `json:"error"`
}

//UploadPartRequest is the json struct a client sends to the server to request a url to upload a part
type UploadPartRequest struct {
	ID           string `json:"fileID"`
	FileUploadID string `json:"fileUploadID"`
	PartNumber   int    `json:"partNumber"`
}

//UploadPartResponse is the json struct sent to the client in response to a UploadPartRequest
type UploadPartResponse struct {
	ID            string `json:"fileID"`
	PartUploadURL string `json:"partUploadUrl"`
	PartNumber    int    `json:"partNumber"`
	Error         int    `json:"error"`
}

//UploadFileCompleteRequest is the json struct a client sends to the server to indicate that a file is uploaded
type UploadFileCompleteRequest struct {
	ID           string `json:"fileID"`
	FileUploadID string `json:"fileUploadID"`
	Parts        []Part `json:"parts"`
}

type Part struct {
	PartNumber int    `json:"partNumber"`
	ETag       string `json:"ETag"`
}

//UploadFileCompleteRequestis the json struct sent to the client in response to a UploadFileCompleteRequest
type UploadFileCompleteResponse struct {
	ID    string `json:"fileID"`
	Error int    `json:"error"`
}

func (c *Configuration) NewUpload(ID string) (string, error) {
	sess, err := session.NewSession(&aws.Config{
		Region:           aws.String(c.s3Bucket),
		Credentials:      credentials.NewStaticCredentials(c.s3AccessKey, c.s3SecretKey, ""),
		Endpoint:         aws.String(c.s3Endpoint),
		S3ForcePathStyle: aws.Bool(true),
	})
	if err != nil {
		return "", err
	}

	svc := s3.New(sess, &aws.Config{
		Region: aws.String(c.s3Region),
	})

	multiPartInfo, err := svc.CreateMultipartUpload(&s3.CreateMultipartUploadInput{
		ACL:    aws.String("public-read"),
		Bucket: aws.String(c.s3Bucket),
		Key:    aws.String(ID),
	})
	if err != nil {
		return "", err
	}

	return *multiPartInfo.UploadId, nil

}

func (c *Configuration) UploadFileComplete(w http.ResponseWriter, r *http.Request) {
	//Decode the body into a UploadRequest struct
	decoder := json.NewDecoder(r.Body)
	var u UploadFileCompleteRequest
	err := decoder.Decode(&u)
	if err != nil {
		log.Println(err)
	}

	//Check if the fileID exists
	fileUploadID, err := c.redisClient.Get(u.ID).Result()
	if err == redis.Nil {
		//fileID doesn't exist so respond with Error: 2
		response := UploadPartResponse{Error: 2}
		b, err := json.Marshal(response)
		_, err = w.Write(b)
		if err != nil {
			log.Println(err)
		}
		return
	}
	//Check if the fileUploadIDs from the request match the correct fileUploadID
	if fileUploadID != u.FileUploadID {
		//The fileUploadID associated with the fileID does not match so respond with  Error: 3
		response := UploadPartResponse{Error: 3}
		b, err := json.Marshal(response)
		_, err = w.Write(b)
		if err != nil {
			log.Println(err)
		}
		return
	}
	err = c.CompleteMultipartUpload(u.ID, u.FileUploadID, u.Parts)
	if err != nil {
		log.Println(err)
	}
	// Create a UploadFileCompleteResponsewith relevant data
	response := UploadFileCompleteResponse{
		ID:    u.ID,
		Error: 0,
	}
	b, err := json.Marshal(response)
	//Send UploadFileCompleteResponse marshaled to json
	_, err = w.Write(b)
	if err != nil {
		log.Println(err)
	}
}

func (c *Configuration) UploadPartRequest(w http.ResponseWriter, r *http.Request) {
	//Decode the body into a UploadRequest struct
	decoder := json.NewDecoder(r.Body)
	var u UploadPartRequest
	err := decoder.Decode(&u)
	if err != nil {
		log.Println(err)
	}

	//Check if the fileID exists
	fileUploadID, err := c.redisClient.Get(u.ID).Result()
	if err == redis.Nil {
		//fileID doesn't exist so respond with Error: 2
		response := UploadPartResponse{Error: 2}
		b, err := json.Marshal(response)
		_, err = w.Write(b)
		if err != nil {
			log.Println(err)
		}
		return
	}
	//Check if the fileUploadIDs from the request match the correct fileUploadID
	if fileUploadID != u.FileUploadID {
		//The fileUploadID associated with the fileID does not match so respond with  Error: 3
		response := UploadPartResponse{Error: 3}
		b, err := json.Marshal(response)
		_, err = w.Write(b)
		if err != nil {
			log.Println(err)
		}
		return
	}
	uploadPartURL, err := c.CreateUploadPartURL(u.ID, fileUploadID, u.PartNumber, 30)
	if err != nil {
		log.Println(err)
	}

	// Create a UploadPartResponse with relevant data
	response := UploadPartResponse{
		ID:            u.ID,
		PartUploadURL: uploadPartURL,
		PartNumber:    u.PartNumber,
		Error:         0,
	}
	b, err := json.Marshal(response)
	//Send UploadPartResponse marshaled to json
	_, err = w.Write(b)
	if err != nil {
		log.Println(err)
	}
}

//uploadRequest responds to requests for uploading a new file for a specfified ID
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
	//Create multipart file upload
	multiPartID, err := c.NewUpload(u.ID)
	if err != nil {
		log.Println(err)
	}
	//Update database fields
	err = c.redisClient.Set(u.ID, multiPartID, 0).Err()
	if err != nil {
		log.Println(err)
	}
	err = c.redisClient.Set(multiPartID, u.ID, 0).Err()
	if err != nil {
		log.Println(err)
	}
	//Create PUT url for metainfo
	//6 hours to upload
	metaURL, err := c.CreatePutObjectURL(u.ID+"_meta", 360)
	if err != nil {
		log.Println(err)
	}
	//Create PUT url for secondaryFile
	//6 hours to upload
	secondaryFileURL, err := c.CreatePutObjectURL(u.ID, 360)
	if err != nil {
		log.Println(err)
	}
	// Create a UploadRequestResponse with relevant data
	response := UploadRequestResponse{
		ID:               u.ID,
		FileUploadID:     multiPartID,
		MetaURL:          metaURL,
		SecondaryFileURL: secondaryFileURL,
		Error:            0,
	}
	b, err := json.Marshal(response)
	//Send UploadRequestResponse marshaled to json
	_, err = w.Write(b)
	if err != nil {
		log.Println(err)
	}

}

func (c *Configuration) CompleteMultipartUpload(key, fileUploadID string, parts []Part) error {

	completedParts := make([]string, 0)
	for i := 0; i < len(parts); i++ {
		completedParts = append(completedParts, parts[i].ETag)
	}
	spew.Dump(completedParts)
	resp, err := c.b2Client.FinishLargeFile(fileUploadID, completedParts)
	spew.Dump(resp)
	if err != nil {
		return err
	}
	return nil
}

func (c *Configuration) CreatePutObjectURL(key string, minutes int) (string, error) {
	svc, err := c.CreateS3Service()
	if err != nil {
		return "", err
	}
	req, _ := svc.PutObjectRequest(&s3.PutObjectInput{
		Bucket: aws.String(c.s3Bucket),
		Key:    aws.String(key),
	})
	str, err := req.Presign(time.Duration(minutes) * time.Minute)
	if err != nil {
		return "", err
	}
	return str, nil
}

func (c *Configuration) CreateUploadPartURL(key, fileUploadID string, partNumber, minutes int) (string, error) {
	svc, err := c.CreateS3Service()
	if err != nil {
		return "", err
	}

	req, _ := svc.UploadPartRequest(&s3.UploadPartInput{
		Bucket:     aws.String(c.s3Bucket),
		Key:        aws.String(key),
		PartNumber: aws.Int64(int64(partNumber)),
		UploadId:   aws.String(fileUploadID),
	})
	str, err := req.Presign(time.Duration(minutes) * time.Minute)
	if err != nil {
		return "", err
	}
	return str, nil
}

func (c *Configuration) CreateS3Service() (*s3.S3, error) {
	sess, err := session.NewSession(&aws.Config{
		Region:           aws.String(c.s3Bucket),
		Credentials:      credentials.NewStaticCredentials(c.s3AccessKey, c.s3SecretKey, ""),
		Endpoint:         aws.String(c.s3Endpoint),
		S3ForcePathStyle: aws.Bool(true),
	})
	if err != nil {
		return nil, err
	}

	svc := s3.New(sess, &aws.Config{
		Region: aws.String(c.s3Region),
	})
	return svc, nil

}
