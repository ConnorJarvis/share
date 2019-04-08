const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getKeyMaterial(data) {
    return window.crypto.subtle.importKey(
      "raw",
      data,
      {name: "HKDF"},
      false,
      ["deriveBits", "deriveKey"]
    );
}
  storage = window.localStorage;
async function populateMetadata() {

  let password = window.location.hash.substring(1);
  let id = window.location.pathname.split("/")[2]
  let decodedPassword = b64ToArray(password);

  let decodedIV = b64ToArray(id);
  const keyMaterial = await getKeyMaterial(decodedPassword);

  let metadataKey = await window.crypto.subtle.deriveKey(
    {
        "name": "HKDF",
        "salt": new Uint8Array(),
        "info": encoder.encode('metadata'),
        "hash": "SHA-256"
    },
    keyMaterial,
    { "name": "AES-GCM", "length": 128},
    false,
    [ "encrypt", "decrypt" ]
);

let cdnDomain = document.getElementsByName("cdn-domain")[0].value
  fetch(cdnDomain+id+"_meta")
  .then(response => {
      return response.arrayBuffer();
  }).then(data => {

    crypto.subtle.decrypt({ 'name': 'AES-GCM', 'iv': decodedIV }, metadataKey, data).then(decrypted => {
     
      var uint8View = new Uint8Array(decrypted);

      let metadata = JSON.parse(atob(arrayToB64( uint8View )))
      document.getElementById("file-name").innerHTML = metadata.filename;
      document.getElementById("file-size").innerHTML = formatBytes(metadata.size);
      storage.setItem('filesize',metadata.size)
      storage.setItem('filename',metadata.filename)
      storage.setItem('contenttype',metadata.contenttype)
    }).catch(error => console.error(error));
  })
}

let started = 0


async function downloadFile() {
 

  document.getElementById("download").innerHTML = "Downloading"
  document.getElementById("download").disabled= true

  let password = window.location.hash.substring(1);
    let id = window.location.pathname.split("/")[2]


    let decodedPassword = b64ToArray(password);
    let decodedIV = b64ToArray(id);
    const keyMaterial = await getKeyMaterial(decodedPassword);

    let fileKey = await window.crypto.subtle.deriveKey(
        {
          "name": "HKDF",
          "salt": new Uint8Array(),
          "info": encoder.encode('file'),
          "hash": "SHA-256"
        },
        keyMaterial,
        { "name": "AES-GCM", "length": 128},
        false,
        [ "encrypt", "decrypt" ]
      );
  
    started = new Date().getTime();
    let cdnDomain = document.getElementsByName("cdn-domain")[0].value
    fetch(cdnDomain+id)
    .then(response => {
      if (!response.ok) {
        throw Error(response.status+' '+response.statusText)
      }
    
      if (!response.body) {
        throw Error('ReadableStream not yet supported in this browser.')
      }
      const contentLength = localStorage.getItem('filesize');

    
      const total = parseInt(contentLength, 10);
      let loaded = 0;
    
      return new Response(
        new ReadableStream({
          start(controller) {
            const reader = response.body.getReader();
    
            read();
            function read() {
              reader.read().then(({done, value}) => {
                if (done) {
                  controller.close();
                  return; 
                }
                loaded += value.byteLength;
                progress(loaded, total)
                controller.enqueue(value);
                read();
              }).catch(error => {
                console.error(error);
                controller.error(error)                  
              })
            }
          }
        })
      );
    })
    .then(response => {
        return response.arrayBuffer();
    }).then(data => {
      document.getElementById('download-speed').innerHTML = 'Decrypting file' ;
        crypto.subtle.decrypt({ 'name': 'AES-GCM', 'iv': decodedIV }, fileKey, data).then(decrypted => {
            const blob = new Blob([decrypted]);
            const fileName = localStorage.getItem('filename')
            const link = document.createElement('a');
              const url = URL.createObjectURL(blob);
              link.setAttribute('href', url);
              link.setAttribute('download', fileName);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              document.getElementById('download-speed').innerHTML = 'File downloaded' ;
              document.getElementById("download").innerHTML = "Downloaded"
        }).catch(error => console.error(error));
    }).catch(error => console.error(error));
 
}

function getUploadURL(id) {
  let requestBody = {id: id}
  let csrfToken = document.getElementsByName("csrf")[0].value
  return fetch("/upload/geturl", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken 
    },
    body: JSON.stringify( requestBody),
})
.then(response => response.json());
}

function updateUploadInfo(evt) {
  console.log(evt)
  var file = evt.target.files[0];
  document.getElementById("file-name").innerHTML = file.name;
  document.getElementById("file-size").innerHTML = formatBytes(file.size);
}

async function processEvent(evt) {
    evt.preventDefault();
    document.getElementById("upload").innerHTML = "Uploading"
    document.getElementById("upload").disabled= true
    var file = evt.target[1].files[0];
    if (file.size > 1024*1024*1024) {
      document.getElementById("upload-url").innerHTML = 'File is larger then 1GB';
      document.getElementById("upload").innerHTML = "Upload"
      document.getElementById("upload").disabled= false
      return false
    }else {
      document.getElementById("upload-url").innerHTML = '';
    }
    let password = crypto.getRandomValues(new Uint8Array(16));

    let iv = crypto.getRandomValues(new Uint8Array(16));
    let encodedPassword = arrayToB64(password)
    let encodedIV = arrayToB64(iv)

 

    let keyMaterial = await getKeyMaterial(password);
    let fileKey = await window.crypto.subtle.deriveKey(
        {
          "name": "HKDF",
          "salt": new Uint8Array(),
          "info": encoder.encode('file'),
          "hash": "SHA-256"
        },
        keyMaterial,
        { "name": "AES-GCM", "length": 128},
        false,
        [ "encrypt", "decrypt" ]
      );
  
    let metadataKey = await window.crypto.subtle.deriveKey(
        {
            "name": "HKDF",
            "salt": new Uint8Array(),
            "info": encoder.encode('metadata'),
            "hash": "SHA-256"
        },
        keyMaterial,
        { "name": "AES-GCM", "length": 128},
        false,
        [ "encrypt", "decrypt" ]
    );
    
    getUploadURL(encodedIV).then(uploadResponse => {
      console.log(uploadResponse)
      var reader = new FileReader();
  
      reader.onload = function(e) {
          var data = e.target.result;
          crypto.subtle.encrypt({ 'name': 'AES-GCM', iv }, fileKey, data).then(encrypted => {
            started = new Date().getTime();
  
  
            uploadFile(encrypted, uploadResponse.fileUrl,encodedIV,encodedPassword,uploadResponse.fileFormData)
  
          })
          .catch(console.error);
          let metadata = {
            filename: file.name,
            contenttype: file.type,
            size: file.size
          }
          let metadataJSON = JSON.stringify(metadata)
          crypto.subtle.encrypt({ 'name': 'AES-GCM', iv }, metadataKey, b64ToArray(btoa(metadataJSON))).then(encryptedMetadata => {
            uploadMetadata(encryptedMetadata, uploadResponse.metaUrl, uploadResponse.metaFormData)
          })
          .catch(console.error);

         
          
      }
  
      reader.readAsArrayBuffer(file);  
    })

}

function uploadFile(file, url,encodedIV,encodedPassword, formData) {
  var urlEncodedData = "";
  var urlEncodedDataPairs = [];
  var name;
  var formDatas = new FormData();

  for(name in formData) {
    formDatas.append(name,formData[name])
    urlEncodedDataPairs.push(encodeURIComponent(name) + '=' + encodeURIComponent(formData[name]));
  }
  var blob = new Blob([file]);

  formDatas.append("file",blob)
  urlEncodedData = urlEncodedDataPairs.join('&').replace(/%20/g, '+');
  

  var xhr = new XMLHttpRequest();
  xhr.upload.addEventListener("progress", function(event){
    progress(event.loaded, event.total)
  });
  xhr.addEventListener("load", function(event){
    document.getElementById("upload-url").innerHTML = '<input class="mdl-textfield__input" type="text" value="https://'+window.location.hostname+'/download/'+encodedIV +'/#'+ encodedPassword+'">';
    document.getElementById("upload").innerHTML= "Upload"
    document.getElementById("upload").disabled= false
  });
  xhr.addEventListener("error",function(event){
    document.getElementById("upload-url").innerHTML = 'Failed to upload';
    document.getElementById("upload").innerHTML = "Upload"
    document.getElementById("upload").disabled= false
  });
  xhr.open('POST', url);
  // xhr.setRequestHeader('Content-Type', 'multipart/form-data');
  console.log(urlEncodedData)
  xhr.send(formDatas);
}

function uploadMetadata(file, url, formData) {
  var urlEncodedData = "";
  var urlEncodedDataPairs = [];
  var name;
  var formDatas = new FormData();

  for(name in formData) {
    formDatas.append(name,formData[name])
    urlEncodedDataPairs.push(encodeURIComponent(name) + '=' + encodeURIComponent(formData[name]));
  }
  var blob = new Blob([file]);

  formDatas.append("file",blob)
  urlEncodedData = urlEncodedDataPairs.join('&').replace(/%20/g, '+');
  

  var xhr = new XMLHttpRequest();
  xhr.upload.addEventListener("progress", function(event){

  });
  xhr.addEventListener("load", function(event){

  });
  xhr.addEventListener("error",function(event){
 
  });
  xhr.open('POST', url);
  // xhr.setRequestHeader('Content-Type', 'multipart/form-data');
  console.log(urlEncodedData)
  xhr.send(formDatas);
}

function arrayToB64(array) {
    return base64js
      .fromByteArray(array)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  function b64ToArray(str) {
    return base64js.toByteArray(str + '==='.slice((str.length + 3) % 4));
  }

  function ab2str(buf) {
    return String.fromCharCode.apply(null, new Uint16Array(buf));
  }

  function progress(loaded, total) {
    timeElapsed = (new Date().getTime()-started)/1000
    var bitsLoaded = loaded * 8;
    var speedBps = (bitsLoaded /  timeElapsed).toFixed(2);
    var speedKbps = (speedBps / 1024).toFixed(2);
    var speedMbps = (speedKbps / 1024).toFixed(2);
    document.getElementById('download-speed').innerHTML = speedMbps+' Mbps' ;
    document.getElementById('amount-downloaded').innerHTML = formatBytes(loaded) +' ';
    document.querySelector('#download-progress').MaterialProgress.setProgress(Math.round(loaded/total*100));
  }

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}