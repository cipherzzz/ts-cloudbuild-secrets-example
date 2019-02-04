# **Managing Secrets with KMS in Google Cloud**

<br> 

This article is meant to help a developer manage their secrets when deploying an application to Google Application Engine with the following expectations:

* Github Repository(Typescript express app in our case)
* Application can be built and run locally with Docker
* Google Cloud Development Account

Let's get started

*****

## Secrets management using Google KMS
Google Cloud has the concept of a Key Management System or KMS that is available as a command line tool through gcloud and integrated into the cloudbuild tool. We will use this to encrypt our secrets such as passwords and sensitive fields and provide the decrypted values as environmental variables within the docker containers at build time.

## Keyring/Keys
We should really only need one keyring per instance(integration, testing, and production) would all get their own keyring. 

Check that the kms api is enabled - https://console.developers.google.com/apis/library/cloudkms.googleapis.com

```
# If we do not have a keyring
gcloud kms keyrings create vmi-integration-secrets --location global

# If we already had a keyring or just created one, take a look at what keys are on it
gcloud kms keys list --location global --keyring vmi-integration-secrets

# To add a key - one per application
gcloud kms keys create vertigo-js-node-api --location global --keyring vmi-integration-secrets --purpose encryption

# Verify that your keyring has the keys you expect
gcloud kms keys list --location global --keyring vmi-integration-secrets
```
The keyring and keys will be used to encrypt and decrypt values during the cloudbuild process. You may add and remove keys as your applications change within the cloud. If you have any additional questions this article is great - https://cloud.google.com/kms/docs/quickstart


## Encrypting Secrets
```
# Create a local file with the secret
echo "MyRedisPassword1234" > redis_pw.txt

# To encrypt a secret using KMS
gcloud kms encrypt \
  --plaintext-file=redis_pw.txt \
  --ciphertext-file=redis_pw.enc.txt \
  --location=global \
  --keyring=vmi-integration-secrets \
  --key=vertigo-js-node-api

# Encode the binary encoded secret as base64 string
base64 redis_pw.enc.txt -w 0 > redis_pw.enc.64.txt 
```

You will use the string obtained in the last step to put into your cloudbuild file as described in the next section. 

---

## Decrypting the Secrets
What we ultimately want is a way to decrypt the base64 value of our encoded secret and inject it as an env variable to be read by our application. There are multiple ways to do this, but really only one way with cloudbuild.

### Cloudbuild
In order for cloudbuild to decrypt our value, it must be base64 encoded and denoted as a secret as follows(I am including the WHOLE cloudbuild for clarity):
```
steps:  

# Building image
# Note: You need a shell to resolve environment variables with $$
- name: 'gcr.io/cloud-builders/docker'
  entrypoint: 'bash'
  args: [ 
          '-c',
          'docker build -t gcr.io/$PROJECT_ID/appengine/ts-cloudbuild-secrets-example:latest -f Dockerfile --build-arg REDIS_PASS=$$REDIS_PW .' 
        ]
  secretEnv: ['REDIS_PW']     

# Push Images       
- name: 'gcr.io/cloud-builders/docker'
  args: ['push', 'gcr.io/$PROJECT_ID/appengine/ts-cloudbuild-secrets-example:latest'] 
  

# Deploy to GAE
- name: 'gcr.io/cloud-builders/gcloud'
  args: 
  - 'app'
  - 'deploy'
  - 'app.yaml'
  - '--image-url'
  - 'gcr.io/$PROJECT_ID/appengine/ts-cloudbuild-secrets-example:latest'


secrets:
- kmsKeyName: projects/vmi-integration/locations/global/keyRings/vmi-integration-secrets/cryptoKeys/vertigo-js-node-api
  secretEnv:
    REDIS_PW: CiQAkmpYKP7L1ELHIrdvp/J43k1w6EN/l4wgVZnBMMhbEr/dFxYSPQBMN3wJgwxNRTNmNpaif4rSOSHKy7gHTamaxsxo3la2qCLJfVSHz8jUA4jERssiMZAeKhHvfp5LBTDvjxk=
```

Notice the `secrets:` portion at the bottom. This gives our cloudbuild the secret to be decrypted, the key to use for decryption, and the env variable that we can use to refer to it with.

Step back in the cloudbuild to the docker build directive. Notice how we declare the `secretEnv` attribute along with the expected key of `REDIS_PW`. This tells cloudbuild that we want to pass the decrypted value into this build step rather than the encrypted base64 value. Also note that we have to manually run the command in the `bash` shell in order to use the `$$REDIS_PW` syntax.

### Dockerfile
We are passing in `--build-arg REDIS_PASS=$$REDIS_PW` from our cloudbuild into our docker build directive. We need to tell our `Dockerfile` about this arg in order for it to accept its value.

```
FROM node:8 as native-build
COPY . .
RUN npm install
RUN npm run build

FROM node:carbon-alpine

ARG REDIS_PASS
ENV REDIS_PW=${REDIS_PASS}

WORKDIR /home/node/app
COPY --from=native-build /dist dist/
COPY --from=native-build /package.json .
COPY --from=native-build /node_modules node_modules/

EXPOSE 8080

USER node
CMD ["npm", "start"]
```

Note the `ARG REDIS_PASS` in the `Dockerfile` - this is what enables us to handle the value given from cloudbuild. Also note the `ENV REDIS_PW=${REDIS_PASS}` - this sets the `REDIS_PW` env value that will be baked into the docker container. Whenever we run the image built, the `REDIS_PW` env variable will be present and populated.

## Typescript
We access our decrypted variable within the application by referring to the `process.env.REDIS_PW` variable. Note that we are just checking the value in this case but you could just as easily connect to a server with the secret. See the `src/logic.ts`

```
export function checkSecret(): Payload {
    let message = process.env.REDIS_PW==='MyRedisPassword1234'?"Secret Correct":"Secret Wrong";
    return { message }
}
```

---

## Deployment
Follow the [cloudbuild-local installation instructions](https://cloud.google.com/cloud-build/docs/build-debug-locally) in order to get your gcloud sdk, docker, and local build env working.

Run the following from the root of the project and the `cloudbuild-local` tool will execute the cloudbuild and deploy the application.

``` 
cloud-build-local --config=cloudbuild.yaml --dryrun=false .
```

Access the `https://<service-url>/secret` to see if the decryption worked or not. You should see something like - `{"message":"Secret Correct"}`
