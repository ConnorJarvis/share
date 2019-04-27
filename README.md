# Share

[![Build Status](https://travis-ci.com/ConnorJarvis/share.svg?branch=master)](https://travis-ci.com/ConnorJarvis/share)
[![Go Report Card](https://goreportcard.com/badge/github.com/ConnorJarvis/share)](https://goreportcard.com/report/github.com/ConnorJarvis/share)
[![Coverage Status](https://coveralls.io/repos/github/ConnorJarvis/share/badge.svg?branch=master)](https://coveralls.io/github/ConnorJarvis/share?branch=master)

Share is an encrypted file sharing service that encrypts files and the associated metadata on the client. The service itself holds no information on a file other then the ID and the size of the file.

---

## Requirements

- [Go 1.12+](https://golang.org/)
- [Redis server](https://redis.io/)
- [AWS S3](https://aws.amazon.com/s3/) or compatible service.
- [Vault](https://www.vaultproject.io/) (In production)

---

## Configuration

If the environment variable `prod` is set to true secure cookies are used for CSRF protection and the configuration is retrieved from a Vault secret. The secrets required are:

- `csrf_key`
- `s3_endpoint`
- `s3_access_key`
- `s3_secret_key`
- `s3_bucket`
- `s3_region`
- `cdn_domain`
- `redis_address`
- `redis_password`
- `redis_db`

In development these same secrets can be exposed through environment variables with the same name.

Vault configuration is exposed through the environment variables `vault_addr`, `vault_token` and `vault_secret`. 







