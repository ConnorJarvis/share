package main

import (
	"os"
	"testing"
)

func TestParseTemplates(t *testing.T) {
	err = parseTemplates()
	if err != nil {
		t.Error(err)
	}
}

func TestGetDevelopmentConfig(t *testing.T) {
	config := &Configuration{}
	err = config.getDevelopmentConfig()
	if err == nil {
		t.Error(err)
	}
	os.Setenv("csrf_key", "urYLPTcPue8BMACoJMkAtQ1eabQ0/BlSQ+cR9SQCIMc=")
	os.Setenv("s3_endpoint", "example.com")
	os.Setenv("s3_access_key", "AKIAIOSFODNN7EXAMPLE")
	os.Setenv("s3_secret_key", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")
	os.Setenv("s3_bucket", "example")
	os.Setenv("cdn_domain", "https://cdn.example.com")
	os.Setenv("redis_address", "127.0.0.1:6379")
	os.Setenv("redis_password", "")
	os.Setenv("redis_db", "0")

	err = config.getDevelopmentConfig()
	if err != nil {
		t.Error(err)
	}
}

func TestGetProductionConfig(t *testing.T) {
	config := &Configuration{}
	err = config.getProductionConfig()
	if err != nil {
		t.Error(err)
	}
	err = os.Setenv("vault_addr", "")
	if err != nil {
		t.Error(err)
	}
	err = os.Setenv("vault_token", "")
	if err != nil {
		t.Error(err)
	}

	config = &Configuration{}
	err = config.getProductionConfig()
	if err == nil {
		t.Error(err)
	}

}
