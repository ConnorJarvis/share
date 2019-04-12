package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"log"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

func TestUpload(t *testing.T) {
	req, err := http.NewRequest("GET", "/", nil)
	if err != nil {
		t.Fatal(err)
	}
	config := &Configuration{}
	err = config.getDevelopmentConfig()
	if err != nil {
		t.Error(err)
	}
	// We create a ResponseRecorder (which satisfies http.ResponseWriter) to record the response.
	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(config.upload)

	handler.ServeHTTP(rr, req)

	// Check the status code is what we expect.
	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}
}

func TestDownload(t *testing.T) {
	req, err := http.NewRequest("GET", "/download/asddasd", nil)
	if err != nil {
		t.Fatal(err)
	}
	config := &Configuration{}
	err = config.getDevelopmentConfig()
	if err != nil {
		t.Error(err)
	}
	// We create a ResponseRecorder (which satisfies http.ResponseWriter) to record the response.
	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(config.download)

	handler.ServeHTTP(rr, req)

	// Check the status code is what we expect.
	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}
}

func TestUploadRequest(t *testing.T) {
	rand.Seed(time.Now().UnixNano())
	fileID := strconv.Itoa(rand.Intn(100000))
	var jsonStr = []byte(`{"id":"` + fileID + `"}`)
	req, err := http.NewRequest("POST", "/upload/geturl", bytes.NewBuffer(jsonStr))
	if err != nil {
		t.Fatal(err)
	}

	config := &Configuration{}
	err = config.getDevelopmentConfig()
	if err != nil {
		t.Error(err)
	}
	// We create a ResponseRecorder (which satisfies http.ResponseWriter) to record the response.
	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(config.uploadRequest)

	handler.ServeHTTP(rr, req)
	// Check the status code is what we expect.
	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}

	decoder := json.NewDecoder(rr.Body)
	var u UploadRequestResponse
	err = decoder.Decode(&u)
	if err != nil {
		log.Println(err)
	}

	if u.Error != 0 {
		t.Error(errors.New("ID is already in use"))
	}
	req, err = http.NewRequest("POST", "/upload/geturl", bytes.NewBuffer(jsonStr))
	if err != nil {
		t.Fatal(err)
	}
	handler.ServeHTTP(rr, req)
	decoder = json.NewDecoder(rr.Body)
	err = decoder.Decode(&u)
	if err != nil {
		log.Println(err)
	}
	if u.Error != 1 {
		t.Error(errors.New("Failed to reject ID already in use"))
	}

}
