const encoder = new TextEncoder();
const decoder = new TextDecoder();

//Makes a HKDF key from an array of bytes
function getKeyMaterial(data) {
  return window.crypto.subtle.importKey("raw", data, {
    name: "HKDF"
  }, false, [
    "deriveBits",
    "deriveKey"
  ]);
}

storage = window.localStorage;
//Populates data about a file before download
async function populateMetadata() {
  //Extract password and ID from the url
  let password = window.location.hash.substring(1);
  let id = window.location.pathname.split("/")[2];
  //Decode the password and IV from the password and ID
  let decodedPassword = b64ToArray(password);
  let decodedIV = b64ToArray(id);
  //Initalize the HKDF key
  const keyMaterial = await getKeyMaterial(decodedPassword);
  //Derive the key used to encrypt the metadata
  let metadataKey = await window.crypto.subtle.deriveKey({
      name: "HKDF",
      salt: new Uint8Array(),
      info: encoder.encode("metadata"),
      hash: "SHA-256"
    },
    keyMaterial, {
      name: "AES-GCM",
      length: 128
    },
    false,
    ["encrypt", "decrypt"]
  );
  storage.setItem(
    "cdn_domain",
    document.getElementsByName("cdn-domain")[0].value
  );
  cdnDomain = storage.getItem("cdn_domain");
  //Download the metadata
  fetch(cdnDomain + id + "_meta")
    .then(response => {
      return response.arrayBuffer();
    })
    .then(data => {
      //Decrypt the metadata
      crypto.subtle
        .decrypt({
          name: "AES-GCM",
          iv: decodedIV
        }, metadataKey, data)
        .then(decrypted => {
          var uint8View = new Uint8Array(decrypted);
          //Covert decrypted bytes to object
          let metadata = JSON.parse(atob(arrayToB64(uint8View)));

          storage.setItem("metadata", atob(arrayToB64(uint8View)))
          //Update metadata on the file
          document.getElementById("file-name").innerHTML = metadata.filename;
          document.getElementById("file-size").innerHTML = formatBytes(
            metadata.size
          );
          //Set localstorage values for reuse later
          storage.setItem("filesize", metadata.size);
          storage.setItem("filename", metadata.filename);
          storage.setItem("contenttype", metadata.contenttype);
        })
        .catch(error => console.error(error));
    });
}
//Reference point for download/upload speeds
let started = 0;

async function downloadFile() {
  //Update button to not allow double downloads
  document.getElementById("download").innerHTML = "Downloading";
  document.getElementById("download").disabled = true;
  //Extract password and ID from the url
  let password = window.location.hash.substring(1);
  let id = window.location.pathname.split("/")[2];
  //Decode the password and IV from the password and ID
  let decodedPassword = b64ToArray(password);
  let decodedIV = b64ToArray(id);
  //Initalize the HKDF key
  const keyMaterial = await getKeyMaterial(decodedPassword);
  //Derive the key used to encrypt the file
  let fileKey = await window.crypto.subtle.deriveKey({
      name: "HKDF",
      salt: new Uint8Array(),
      info: encoder.encode("file"),
      hash: "SHA-256"
    },
    keyMaterial, {
      name: "AES-GCM",
      length: 128
    },
    false,
    ["encrypt", "decrypt"]
  );
  cdnDomain = storage.getItem("cdn_domain");
  //Point of reference for the download speed function
  started = new Date().getTime();
  let metadata = JSON.parse(storage.getItem("metadata"))

  const fileStream = streamSaver.createWriteStream(metadata.filename, metadata.size)
  storage.setItem("upload_amount", 0)
  fileDownloader(cdnDomain + id, fileKey, decodedIV, fileStream)

}


async function fileDownloader(url, fileKey, iv, fileStream) {
  const writer = fileStream.getWriter()
  let metadata = JSON.parse(storage.getItem("metadata"))
  let currentIndex = 0
  for (i = 0; i < metadata.parts.length; i++) {
    await downloadPart(url, currentIndex, currentIndex + metadata.parts[i].partEncryptedLength - 1).then(function (encryptedPart) {
      console.log(encryptedPart)
      return decryptPart(encryptedPart, fileKey, iv)
    }).then(function (decryptedData) {
      writer.write(new Uint8Array(decryptedData))
      currentIndex = currentIndex + metadata.parts[i].partEncryptedLength
      if (i === metadata.parts.length - 1) {
        writer.close();
      }
    })
  }




}

async function downloadPart(url, startRange, endRange) {

  return new Promise(function (resolve, reject) {
    let metadata = JSON.parse(storage.getItem("metadata"))
    const fileSize = parseInt(metadata.size, 10)
    var xhr = new XMLHttpRequest();
    xhr.addEventListener("progress", function (event) {
      lastUploaded = parseInt(storage.getItem("last_current_upload_amount"), 10)
      currentUploaded = event.loaded
      totalUploaded = parseInt(storage.getItem("upload_amount"), 10)
      totalUploaded += Math.max(currentUploaded - lastUploaded, 0)
      storage.setItem("upload_amount", totalUploaded)
      storage.setItem("last_current_upload_amount", currentUploaded)
      let displayLoaded = totalUploaded;
      if (displayLoaded > fileSize) {
        displayLoaded = fileSize;
      }
      progress(displayLoaded, fileSize);
    });




    //If there is an error display as such
    xhr.addEventListener("error", function (event) {
      document.getElementById("upload-url").innerHTML = "Failed to download";
      document.getElementById("upload").innerHTML = "Upload";
      document.getElementById("upload").disabled = false;
      reject({
        status: this.status,
        statusText: xhr.statusText
      });
    });

    xhr.addEventListener("load", function (event) {
      resolve(
        xhr.response
      )
    })

    xhr.responseType = "arraybuffer";
    xhr.open("GET", url);
    xhr.setRequestHeader("Range", "bytes=" + startRange + "-" + endRange)
    //Upload file
    xhr.send();

  })



}

async function decryptPart(encryptedPart, fileKey, iv) {
  return crypto.subtle
    .decrypt({
      name: "AES-GCM",
      iv: iv
    }, fileKey, encryptedPart)
}

//getUploadURL passes a requested ID to the backend server and returns the response
function getUploadURL(id) {
  let requestBody = {
    id: id
  };
  //Get the CSRF token from the page
  let csrfToken = document.getElementsByName("csrf")[0].value;
  return fetch("/upload/geturl", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      //Pass the required CSRF token along with the request
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify(requestBody)
  }).then(response => response.json());
}

//updateUploadInfo parses the onchange event and displays information on the file
function updateUploadInfo(evt) {
  var file = evt.target.files[0];
  document.getElementById("file-name").innerHTML = file.name;
  document.getElementById("file-size").innerHTML = formatBytes(file.size);
  document.getElementById("upload-url").innerHTML = "";
}

//onUploadFile handles the form submit event from the file picker form
async function onUploadFile(evt) {
  //Prevent the form from actually submitting
  evt.preventDefault();
  if (typeof evt.target[1].files[0] === "undefined") {
    document.getElementById("upload-url").innerHTML =
      "Please select a file before uploading";
    return;
  }
  //Update the status and disable the upload button
  document.getElementById("upload").innerHTML = "Uploading";
  document.getElementById("upload").disabled = true;
  //Define the file being uploaded
  var file = evt.target[1].files[0];
  //If the file is larger then 1GB then reject the file and ready the form for a different file to be chosen
  if (file.size > 1024 * 1024 * 1024 * 6) {
    document.getElementById("upload-url").innerHTML = "File is larger then 6GB";
    document.getElementById("upload").innerHTML = "Upload";
    document.getElementById("upload").disabled = false;
    return false;
  } else {
    //Clear the upload URL option
    //This is here so if the previous file failed to upload the displayed info is up to date
    document.getElementById("upload-url").innerHTML = "";
  }
  //Generate a random password
  let password = crypto.getRandomValues(new Uint8Array(16));
  //Generate a random IV
  //The IV is also reused as the file ID
  let iv = crypto.getRandomValues(new Uint8Array(16));
  //Encode the Password and IV/ID
  let encodedPassword = arrayToB64(password);
  let encodedIV = arrayToB64(iv);
  //Initalize the HKDF key
  let keyMaterial = await getKeyMaterial(password);
  //Dervie the key used to encrypt the file
  let fileKey = await window.crypto.subtle.deriveKey({
      name: "HKDF",
      salt: new Uint8Array(),
      info: encoder.encode("file"),
      hash: "SHA-256"
    },
    keyMaterial, {
      name: "AES-GCM",
      length: 128
    },
    false,
    ["encrypt", "decrypt"]
  );
  //Dervie the key used to encrypt the metadata
  let metadataKey = await window.crypto.subtle.deriveKey({
      name: "HKDF",
      salt: new Uint8Array(),
      info: encoder.encode("metadata"),
      hash: "SHA-256"
    },
    keyMaterial, {
      name: "AES-GCM",
      length: 128
    },
    false,
    ["encrypt", "decrypt"]
  );

  //Request upload URLs for the file and metadata
  getUploadURL(encodedIV).then(uploadResponse => {
    //If the error is 1 then the file ID is already in use
    if (uploadResponse.error === 1) {
      document.getElementById("upload-url").innerHTML =
        "File ID is already in use please try again";
      document.getElementById("upload").innerHTML = "Upload";
      document.getElementById("upload").disabled = false;
      return;
    }



    //Point of reference for the upload speed function
    started = new Date().getTime();
    storage.setItem("upload_amount", 0)
    if (file.size > 50000000) {
      multiPartFileUploader(file, encodedIV, uploadResponse.fileUploadID, fileKey, iv, metadataKey, uploadResponse.metaUrl, encodedPassword)
    } else {
      singleFileUploader(file, encodedIV, uploadResponse.fileUploadID, fileKey, iv, metadataKey, uploadResponse.metaUrl, encodedPassword, uploadResponse.secondaryFileUrl)
    }

  });
}

async function singleFileUploader(file, fileID, fileUploadID, fileKey, iv, metadataKey, metaUrl, password, fileUrl) {
  //Metadata for the encrypted file
  let metadata = {
    filename: file.name,
    contenttype: file.type,
    size: file.size,
    parts: [],
  };
  let partSize = 50000000
  let numberOfParts = Math.ceil((file.size / partSize))
  var parts = []
  let partData = file;
  var partDataBuffer = await (new Response(partData)).arrayBuffer()
  await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv
    },
    fileKey,
    partDataBuffer
  ).then(encryptedPart => {
    metadata.parts.push({
      partNumber: i,
      partEncryptedLength: encryptedPart.byteLength
    })
    var final = false
    if (i === numberOfParts) {
      final = true
    }
    return uploadPart(encryptedPart, fileUrl, file.size, final, fileID, password)
  }).then(function (result) {
    console.log(result)
    parts.push({
      partNumber: i,
      ETag: result
    })
    if (i === numberOfParts) {
      //Convert metadata to JSON
      let metadataJSON = JSON.stringify(metadata);
      console.log(metadata)
      //Encrypt the metadata
      crypto.subtle
        .encrypt({
            name: "AES-GCM",
            iv
          },
          metadataKey,
          b64ToArray(btoa(metadataJSON))
        )
        .then(encryptedMetadata => {
          //Upload metadata
          uploadMetadata(
            encryptedMetadata,
            metaUrl
          );
        })
        .catch(console.error);
    }
  })
}

async function multiPartFileUploader(file, fileID, fileUploadID, fileKey, iv, metadataKey, metaUrl, password) {
  //Metadata for the encrypted file
  let metadata = {
    filename: file.name,
    contenttype: file.type,
    size: file.size,
    parts: [],
  };
  let partSize = 50000000
  let numberOfParts = Math.ceil((file.size / partSize))
  var parts = []
  for (i = 1; i <= numberOfParts; i++) {
    let partData = file.slice(((i - 1) * partSize), i * partSize)
    var partDataBuffer = await (new Response(partData)).arrayBuffer()
    await getUploadPartURL(fileID, fileUploadID, i).then(response => {
      console.log(response)
      return response
    }).then(function (response) {
      return crypto.subtle.encrypt({
          name: "AES-GCM",
          iv
        },
        fileKey,
        partDataBuffer
      ).then(encryptedPart => {
        metadata.parts.push({
          partNumber: i,
          partEncryptedLength: encryptedPart.byteLength
        })
        var final = false
        if (i === numberOfParts) {
          final = true
        }
        return uploadPart(encryptedPart, response.partUploadUrl, file.size, final, fileID, password)
      }).then(function (result) {
        console.log(result)
        parts.push({
          partNumber: i,
          ETag: result
        })
        if (i === numberOfParts) {
          //Convert metadata to JSON
          let metadataJSON = JSON.stringify(metadata);
          console.log(metadata)
          //Encrypt the metadata
          crypto.subtle
            .encrypt({
                name: "AES-GCM",
                iv
              },
              metadataKey,
              b64ToArray(btoa(metadataJSON))
            )
            .then(encryptedMetadata => {
              //Upload metadata
              uploadMetadata(
                encryptedMetadata,
                metaUrl
              );
            })
            .catch(console.error);
          completeUpload(fileID, fileUploadID, parts)
        }
      })
    })
  }
}

function completeUpload(fileID, fileUploadID, parts) {
  let requestBody = {
    fileID: fileID,
    fileUploadID: fileUploadID,
    parts: parts
  };
  //Get the CSRF token from the page
  let csrfToken = document.getElementsByName("csrf")[0].value;
  return fetch("/upload/completeupload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      //Pass the required CSRF token along with the request
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify(requestBody)
  }).then(response => response.json());

}

function uploadPart(partData, partUploadUrl, fileSize, final, fileID, password) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", function (event) {
      lastUploaded = parseInt(storage.getItem("last_current_upload_amount"), 10)
      currentUploaded = event.loaded
      totalUploaded = parseInt(storage.getItem("upload_amount"), 10)
      totalUploaded += Math.max(currentUploaded - lastUploaded, 0)
      storage.setItem("upload_amount", totalUploaded)
      storage.setItem("last_current_upload_amount", currentUploaded)
      let displayLoaded = totalUploaded;
      if (displayLoaded > fileSize) {
        displayLoaded = fileSize;
      }
      progress(displayLoaded, fileSize);
    });




    //If there is an error display as such
    xhr.addEventListener("error", function (event) {
      document.getElementById("upload-url").innerHTML = "Failed to upload";
      document.getElementById("upload").innerHTML = "Upload";
      document.getElementById("upload").disabled = false;
      reject({
        status: this.status,
        statusText: xhr.statusText
      });
    });

    xhr.addEventListener("load", function (event) {
      if (final === true) {
        document.getElementById("upload-url").innerHTML =
          '<input class="mdl-textfield__input" type="text" id="url" onfocus="copyURL()" contenteditable="true" value="https://' +
          window.location.hostname +
          "/download/" +
          fileID +
          "/#" +
          password +
          '" readonly>';
      }
      document.getElementById("upload").innerHTML = "Upload";
      document.getElementById("upload").disabled = false;
      resolve(xhr.getResponseHeader("etag").replace(/\"/g, "").replace(/-1/g, ""))
    });
    xhr.open("PUT", partUploadUrl);
    //Upload file
    xhr.send(partData);

  })

}

//getUploadPartURL 
function getUploadPartURL(fileID, fileUploadID, partNumber) {
  let requestBody = {
    fileID: fileID,
    fileUploadID: fileUploadID,
    partNumber: partNumber
  };
  //Get the CSRF token from the page
  let csrfToken = document.getElementsByName("csrf")[0].value;
  return fetch("/upload/getuploadparturl", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      //Pass the required CSRF token along with the request
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify(requestBody)
  }).then(response => response.json());
}



function uploadFile(file, url, encodedIV, encodedPassword, formData, fileSize) {
  //Inital Variables
  var name;
  var formDatas = new FormData();
  //Build form data from uploadRequest
  for (name in formData) {
    formDatas.append(name, formData[name]);
  }
  //Represent the file as a blob
  var blob = new Blob([file]);
  formDatas.append("file", blob);

  var xhr = new XMLHttpRequest();
  //Update progress when a "progress" event is fired
  xhr.upload.addEventListener("progress", function (event) {
    let displayLoaded = event.loaded;
    if (event.loaded > fileSize) {
      displayLoaded = fileSize;
    }
    progress(displayLoaded, fileSize);
  });
  //When file is fully uploaded display download url
  xhr.addEventListener("load", function (event) {
    document.getElementById("upload-url").innerHTML =
      '<input class="mdl-textfield__input" type="text" id="url" onfocus="copyURL()" contenteditable="true" value="https://' +
      window.location.hostname +
      "/download/" +
      encodedIV +
      "/#" +
      encodedPassword +
      '" readonly>';
    document.getElementById("upload").innerHTML = "Upload";
    document.getElementById("upload").disabled = false;
  });
  //If there is an error display as such
  xhr.addEventListener("error", function (event) {
    document.getElementById("upload-url").innerHTML = "Failed to upload";
    document.getElementById("upload").innerHTML = "Upload";
    document.getElementById("upload").disabled = false;
  });

  xhr.open("POST", url);
  //Upload file
  xhr.send(formDatas);
}

function uploadMetadata(file, url) {

  var xhr = new XMLHttpRequest();

  xhr.open("PUT", url);
  //Upload file
  xhr.send(file);
}

//Convert array to base64
function arrayToB64(array) {
  return base64js
    .fromByteArray(array)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
//Convert base64 to array
function b64ToArray(str) {
  return base64js.toByteArray(str + "===".slice((str.length + 3) % 4));
}

function copyURL() {
  var copyText = document.getElementById("url");
  var oldContentEditable = copyText.contentEditable,
    oldReadOnly = copyText.readOnly,
    range = document.createRange();
  copyText.contentEditable = true;
  copyText.readOnly = true;
  range.selectNodeContents(copyText);
  var s = window.getSelection();
  s.removeAllRanges();
  s.addRange(range);

  copyText.setSelectionRange(0, 999999); // A big number, to cover anything that could be inside the element.

  copyText.contentEditable = oldContentEditable;
  copyText.readOnly = oldReadOnly;
  document.execCommand("copy");
  var snackbarContainer = document.querySelector("#toast");
  var data = {
    message: "URL Copied"
  };
  snackbarContainer.MaterialSnackbar.showSnackbar(data);
}

//Update progress for upload or download
function progress(loaded, total) {
  timeElapsed = (new Date().getTime() - started) / 1000;
  var bitsLoaded = loaded * 8;
  var speedBps = (bitsLoaded / timeElapsed).toFixed(2);
  var speedKbps = (speedBps / 1024).toFixed(2);
  var speedMbps = (speedKbps / 1024).toFixed(2);
  document.getElementById("network-speed").innerHTML = speedMbps + " Mbps";
  document.getElementById("amount-transferred").innerHTML =
    formatBytes(loaded) + " ";
  document
    .querySelector("#network-progress")
    .MaterialProgress.setProgress(Math.round((loaded / total) * 100));
}
//Format bytes to a human readable format
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}