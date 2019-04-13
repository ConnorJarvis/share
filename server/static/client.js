const encoder = new TextEncoder();
const decoder = new TextDecoder();

//Makes a HKDF key from an array of bytes
function getKeyMaterial(data) {
  return window.crypto.subtle.importKey("raw", data, { name: "HKDF" }, false, [
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
  let metadataKey = await window.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new Uint8Array(),
      info: encoder.encode("metadata"),
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 128 },
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
        .decrypt({ name: "AES-GCM", iv: decodedIV }, metadataKey, data)
        .then(decrypted => {
          var uint8View = new Uint8Array(decrypted);
          //Covert decrypted bytes to object
          let metadata = JSON.parse(atob(arrayToB64(uint8View)));
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
  let fileKey = await window.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new Uint8Array(),
      info: encoder.encode("file"),
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt", "decrypt"]
  );
  cdnDomain = storage.getItem("cdn_domain");
  //Point of reference for the download speed function
  started = new Date().getTime();
  //Begin downloading the file
  fetch(cdnDomain + id)
    .then(response => {
      //If file fails to download
      if (!response.ok) {
        throw Error(response.status + " " + response.statusText);
      }

      if (!response.body) {
        throw Error("ReadableStream not yet supported in this browser.");
      }
      //Get contentLength of file from local storage
      const contentLength = localStorage.getItem("filesize");
      //Parse this to an int
      const total = parseInt(contentLength, 10);
      //Amount of file that has been downloaded
      let loaded = 0;
      //Use a readable stream so we can track download progress and speed
      return new Response(
        new ReadableStream({
          start(controller) {
            const reader = response.body.getReader();

            read();
            function read() {
              reader
                .read()
                .then(({ done, value }) => {
                  if (done) {
                    controller.close();
                    return;
                  }
                  loaded += value.byteLength;
                  //Update progress on download
                  progress(loaded, total);
                  controller.enqueue(value);
                  read();
                })
                .catch(error => {
                  console.error(error);
                  controller.error(error);
                });
            }
          }
        })
      );
    })
    .then(response => {
      //Return the file as an arrayBuffer
      return response.arrayBuffer();
    })
    .then(data => {
      //Update status to that it is being decrypted
      document.getElementById("network-speed").innerHTML = "Decrypting file";
      //Decrypt file
      crypto.subtle
        .decrypt({ name: "AES-GCM", iv: decodedIV }, fileKey, data)
        .then(decrypted => {
          //Create a blob with the decrypted file
          const blob = new Blob([decrypted]);
          const fileName = localStorage.getItem("filename");
          //Create a link to the inbrowser blob
          const link = document.createElement("a");
          const url = URL.createObjectURL(blob);
          link.setAttribute("href", url);
          link.setAttribute("download", fileName);
          link.style.visibility = "hidden";
          document.body.appendChild(link);
          //Download the file from within the browser
          link.click();
          document.body.removeChild(link);
          //Update status that file is downloaded
          document.getElementById("network-speed").innerHTML =
            "File downloaded";
          document.getElementById("download").innerHTML = "Downloaded";
        })
        .catch(error => console.error(error));
    })
    .catch(error => console.error(error));
}
//getUploadURL passes a requested ID to the backend server and returns the response
function getUploadURL(id) {
  let requestBody = { id: id };
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
  //If the file is larger then 1GB then reject the file and ready the form for a different file to be picked
  if (file.size > 1024 * 1024 * 1024) {
    document.getElementById("upload-url").innerHTML = "File is larger then 1GB";
    document.getElementById("upload").innerHTML = "Upload";
    document.getElementById("upload").disabled = false;
    return false;
  } else {
    //Clear the upload URL option
    //This is here if the previous file failed to upload so displayed info is up to date
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
  let fileKey = await window.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new Uint8Array(),
      info: encoder.encode("file"),
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt", "decrypt"]
  );
  //Dervie the key used to encrypt the metadata
  let metadataKey = await window.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new Uint8Array(),
      info: encoder.encode("metadata"),
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt", "decrypt"]
  );
  //Request upload URLs for the file and metadata
  getUploadURL(encodedIV).then(uploadResponse => {
    //Open a FileReader
    var reader = new FileReader();
    //If the error is 1 then the file ID is already in use
    if (uploadResponse.error === 1) {
      document.getElementById("upload-url").innerHTML =
        "File ID is already in use please try again";
      document.getElementById("upload").innerHTML = "Upload";
      document.getElementById("upload").disabled = false;
      return;
    }
    //When the reader is loaded
    reader.onload = function(e) {
      //Define the Reader target
      var data = e.target.result;
      //Encrypt the file
      crypto.subtle
        .encrypt({ name: "AES-GCM", iv }, fileKey, data)
        .then(encrypted => {
          //Reference time to calculate upload speed
          started = new Date().getTime();
          //Upload the file
          uploadFile(
            encrypted,
            uploadResponse.fileUrl,
            encodedIV,
            encodedPassword,
            uploadResponse.fileFormData
          );
        })
        .catch(console.error);
      //Metadata for the encrypted file
      let metadata = {
        filename: file.name,
        contenttype: file.type,
        size: file.size
      };
      //Convert metadata to JSON
      let metadataJSON = JSON.stringify(metadata);
      //Encrypt the metadata
      crypto.subtle
        .encrypt(
          { name: "AES-GCM", iv },
          metadataKey,
          b64ToArray(btoa(metadataJSON))
        )
        .then(encryptedMetadata => {
          //Upload metadata
          uploadMetadata(
            encryptedMetadata,
            uploadResponse.metaUrl,
            uploadResponse.metaFormData
          );
        })
        .catch(console.error);
    };
    //Read the selected file as an ArrayBuffer
    reader.readAsArrayBuffer(file);
  });
}

function uploadFile(file, url, encodedIV, encodedPassword, formData) {
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
  xhr.upload.addEventListener("progress", function(event) {
    progress(event.loaded, event.total);
  });
  //When file is fully uploaded display download url
  xhr.addEventListener("load", function(event) {
    document.getElementById("upload-url").innerHTML =
      '<input class="mdl-textfield__input" type="text" id="url" onfocus="copyURL()" value="https://' +
      window.location.hostname +
      "/download/" +
      encodedIV +
      "/#" +
      encodedPassword +
      '">';
    document.getElementById("upload").innerHTML = "Upload";
    document.getElementById("upload").disabled = false;
  });
  //If there is an error display as such
  xhr.addEventListener("error", function(event) {
    document.getElementById("upload-url").innerHTML = "Failed to upload";
    document.getElementById("upload").innerHTML = "Upload";
    document.getElementById("upload").disabled = false;
  });

  xhr.open("POST", url);
  //Upload file
  xhr.send(formDatas);
}

function uploadMetadata(file, url, formData) {
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

  xhr.open("POST", url);
  //Upload file
  xhr.send(formDatas);
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
  copyText.select();
  document.execCommand("copy");
  var snackbarContainer = document.querySelector("#toast");
  var data = { message: "URL Copied" };
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
