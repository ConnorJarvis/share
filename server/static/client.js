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

async function populateMetadata() {
  let password = window.location.hash.substring(1);
  console.log(password)
  let id = window.location.pathname.split("/")[2]
  let decodedPassword = b64ToArray(password);
  console.log(decodedPassword)
  console.log(id)
  let decodedIV = b64ToArray(id);
  console.log(decodedIV)
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
    console.log
    crypto.subtle.decrypt({ 'name': 'AES-GCM', 'iv': decodedIV }, metadataKey, data).then(decrypted => {
      var uint8View = new Uint8Array(decrypted);
      console.log(uint8View)
      console.log(arrayToB64( uint8View ))
      console.log()
      let metadata = JSON.parse(atob(arrayToB64( uint8View )))
      document.getElementById("fileName").innerHTML = metadata.filename;
      document.getElementById("fileSize").innerHTML = metadata.size;
    }).catch(error => console.error(error));
  })
}




async function downloadFile(evt) {
  evt.preventDefault();
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
  

    let cdnDomain = document.getElementsByName("cdn-domain")[0].value

   fetch(cdnDomain+id)
    .then(response => {
        return response.arrayBuffer();
    }).then(data => {
      console.log(data)
        crypto.subtle.decrypt({ 'name': 'AES-GCM', 'iv': decodedIV }, fileKey, data).then(decrypted => {
            const blob = new Blob([decrypted]);
            const fileName = document.getElementById("fileName").innerHTML;
            const link = document.createElement('a');
              const url = URL.createObjectURL(blob);
              link.setAttribute('href', url);
              link.setAttribute('download', fileName);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
        }).catch(error => console.error(error));
    }).catch(error => console.error(error));
 
}

function getUploadURL(fileSize,metadata, id) {
  let requestBody = {fileSize: fileSize, metadata: metadata, id: id}
  let csrfToken = document.getElementsByName("csrf")[0].value
  return fetch("/upload/geturl", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken 
    },
    body: JSON.stringify( requestBody), // body data type must match "Content-Type" header
})
.then(response => response.json());
}

async function processEvent(evt) {
    evt.preventDefault();
    var file = evt.target[0].files[0];
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
    let metadata = {
      filename: file.name,
      contenttype: file.type,
      size: file.size
    }
    let metadataJSON = JSON.stringify(metadata)
    console.log(b64ToArray(btoa(metadataJSON)))
    let encryptedMetadata = await crypto.subtle.encrypt({ 'name': 'AES-GCM', iv }, metadataKey, b64ToArray(btoa(metadataJSON)))
    console.log(encryptedMetadata)
    let uploadResponse = await getUploadURL(file.size, arrayToB64(encryptedMetadata), encodedIV)
    console.log(uploadResponse)
    var reader = new FileReader();

    reader.onload = function(e) {
        var data = e.target.result;
        putFile(encryptedMetadata, uploadResponse.metaUrl).then(response => {
          if (response.status === 200) {
            crypto.subtle.encrypt({ 'name': 'AES-GCM', iv }, fileKey, data).then(encrypted => {
              putFile(encrypted, uploadResponse.url).then(response => {
                if (response.status === 200) {
                  document.getElementById("upload-url").innerHTML = '<input class="mdl-textfield__input" type="text" value="https://'+window.location.hostname+'/download/'+encodedIV +'/#'+ encodedPassword+'">';
                } else {
                  document.getElementById("upload-url").innerHTML = 'Failed to upload';
                
                }
                
              })
          })
          .catch(console.error);
          } else {
            document.getElementById("upload-url").innerHTML = 'Failed to upload';
          }
        })
        
    }

    reader.readAsArrayBuffer(file);  
}

function putFile(file, url) {
  return fetch(url, {
    method: "PUT", // *GET, POST, PUT, DELETE, etc.
    headers: {
        // "Content-Type": "application/x-www-form-urlencoded",
    },
    body: file,
})
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