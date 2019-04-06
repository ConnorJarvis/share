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


async function downloadFile(password, iv, id) {
    let decodedPassword = b64ToArray(password);
    let decodedIV = b64ToArray(iv);
    const keyMaterial = await getKeyMaterial(decodedPassword);

    let fileKey = await window.crypto.subtle.deriveKey(
        {
          "name": "HKDF",
          "salt": new Uint8Array(),
          "info": encoder.encode('file'),
          "hash": "SHA-256"
        },
        keyMaterial,
        { "name": "AES-GCM", "length": 256},
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
        { "name": "AES-GCM", "length": 256},
        false,
        [ "encrypt", "decrypt" ]
    );
   fetch("https://b2.vangel.io/file/vangel-cdn/"+id)
    .then(response => {
        return response.arrayBuffer();
    }).then(data => {
        crypto.subtle.decrypt({ 'name': 'AES-GCM', 'iv': decodedIV }, fileKey, data).then(decrypted => {
            const blob = new Blob([decrypted]);
            const fileName = "image0.jpg";
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


async function processEvent(evt) {
    var file = evt.target.files[0];
    // let metadata = {
    //     id: "test",
    //     filename: file.name,
    //     size: file.size
    // }
    uploadFile(file, url)
}

async function uploadFile(file, url) {
    let id = "test"
    let password = crypto.getRandomValues(new Uint8Array(16));
    let iv = crypto.getRandomValues(new Uint8Array(16));
    console.log(password)
    let encodedPassword = arrayToB64(password)
    console.log(encodedPassword)
    let encodedIV = arrayToB64(iv)
    console.log(encodedIV)
    let keyMaterial = await getKeyMaterial(password);
    let fileKey = await window.crypto.subtle.deriveKey(
        {
          "name": "HKDF",
          "salt": new Uint8Array(),
          "info": encoder.encode('file'),
          "hash": "SHA-256"
        },
        keyMaterial,
        { "name": "AES-GCM", "length": 256},
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
        { "name": "AES-GCM", "length": 256},
        false,
        [ "encrypt", "decrypt" ]
    );

   

    var reader = new FileReader();

    reader.onload = function(e) {
        var data = e.target.result;
        crypto.subtle.encrypt({ 'name': 'AES-GCM', iv }, fileKey, data).then(encrypted => {
            putFile(encrypted, url)
        })
        .catch(console.error);
    }

    reader.readAsArrayBuffer(file);   

}

function putFile(file, url) {
    var xhr = new XMLHttpRequest ()
    xhr.open('PUT', url, true)
    xhr.send(file)
    xhr.onload = () => {
      if (xhr.status == 200) {
        console.log("File downloaded")
      }
    }
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