FROM golang:1.12.2 as builder
WORKDIR /builds/ConnorJ/share/server
COPY go.mod .
RUN go get
COPY main.go  .
COPY s3.go  .
COPY web.go  .
COPY ./templates/  ./templates/
COPY ./static/  ./static/
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o share .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /builds/ConnorJ/share/server .
CMD ["./share"]