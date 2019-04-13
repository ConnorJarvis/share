#!/bin/bash
if [[ ${TRAVIS_PULL_REQUEST} != "false" ]]
then
exit
fi
if [[ ${TRAVIS_SECURE_ENV_VARS} == "true" ]]
then
BRANCH=dev
if [[ ${TRAVIS_BRANCH} == "master" ]]
then
BRANCH=stable
fi
eval "docker pull ${DOCKER_USERNAME}/share:${BRANCH}"
eval "docker build -t ${DOCKER_USERNAME}/share:${BRANCH} --cache-from ${DOCKER_USERNAME}/share:${BRANCH} ."
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
eval "docker push ${DOCKER_USERNAME}/share:${BRANCH}"
fi