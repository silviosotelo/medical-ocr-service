# Ejemplos de Uso de la API

## JavaScript (Node.js con axios)

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function processarOrdenMedica(filePath) {
  try {
    const formData = new FormData();
    formData.append('archivo', fs.createReadStream(filePath));
    formData.append('opciones', JSON.stringify({
      extraer_diagnostico: true,
      detectar_urgencias: true,
      validar_matricula: false
    }));

    const response = await axios.post('http://localhost:3000/api/visar', formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    console.log('Resultado:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

// Uso
processarOrdenMedica('./orden_medica.pdf');
```

## JavaScript (Browser con Fetch)

```javascript
async function uploadOrdenMedica(fileInput) {
  const formData = new FormData();
  formData.append('archivo', fileInput.files[0]);
  formData.append('opciones', JSON.stringify({
    extraer_diagnostico: true,
    detectar_urgencias: true,
    validar_matricula: false
  }));

  try {
    const response = await fetch('http://localhost:3000/api/visar', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Resultado:', result);
    return result;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// HTML
// <input type="file" id="fileInput" accept=".jpg,.jpeg,.png,.pdf">
// <button onclick="uploadOrdenMedica(document.getElementById('fileInput'))">Procesar</button>
```

## Python con requests

```python
import requests
import json

def procesar_orden_medica(file_path):
    url = 'http://localhost:3000/api/visar'
    
    opciones = {
        'extraer_diagnostico': True,
        'detectar_urgencias': True,
        'validar_matricula': False
    }
    
    files = {
        'archivo': open(file_path, 'rb')
    }
    
    data = {
        'opciones': json.dumps(opciones)
    }
    
    try:
        response = requests.post(url, files=files, data=data)
        response.raise_for_status()
        
        result = response.json()
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return result
        
    except requests.exceptions.RequestException as e:
        print(f'Error: {e}')
        if hasattr(e.response, 'json'):
            print(e.response.json())
        raise
    finally:
        files['archivo'].close()

# Uso
if __name__ == '__main__':
    procesar_orden_medica('./orden_medica.pdf')
```

## cURL

```bash
# Procesar orden médica JPG
curl -X POST http://localhost:3000/api/visar \
  -F "archivo=@orden_medica.jpg" \
  -F 'opciones={"extraer_diagnostico":true,"detectar_urgencias":true}' \
  | jq '.'

# Procesar orden médica PDF
curl -X POST http://localhost:3000/api/visar \
  -F "archivo=@orden_medica.pdf" \
  -F 'opciones={"extraer_diagnostico":true,"detectar_urgencias":true,"validar_matricula":false}' \
  | jq '.'

# Health Check
curl -X GET http://localhost:3000/health | jq '.'

# Obtener métricas
curl -X GET http://localhost:3000/health/metrics | jq '.'
```

## PHP

```php
<?php

function procesarOrdenMedica($filePath) {
    $url = 'http://localhost:3000/api/visar';
    
    $opciones = json_encode([
        'extraer_diagnostico' => true,
        'detectar_urgencias' => true,
        'validar_matricula' => false
    ]);
    
    $cFile = new CURLFile($filePath);
    
    $postData = [
        'archivo' => $cFile,
        'opciones' => $opciones
    ];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        throw new Exception("Error HTTP: $httpCode - $response");
    }
    
    $result = json_decode($response, true);
    return $result;
}

// Uso
try {
    $resultado = procesarOrdenMedica('./orden_medica.pdf');
    echo json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
```

## C# (.NET)

```csharp
using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using Newtonsoft.Json;

public class MedicalOCRClient
{
    private readonly HttpClient _httpClient;
    private const string BaseUrl = "http://localhost:3000";

    public MedicalOCRClient()
    {
        _httpClient = new HttpClient();
    }

    public async Task<dynamic> ProcesarOrdenMedica(string filePath)
    {
        using var form = new MultipartFormDataContent();
        
        // Agregar archivo
        var fileContent = new ByteArrayContent(File.ReadAllBytes(filePath));
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse("application/pdf");
        form.Add(fileContent, "archivo", Path.GetFileName(filePath));
        
        // Agregar opciones
        var opciones = new
        {
            extraer_diagnostico = true,
            detectar_urgencias = true,
            validar_matricula = false
        };
        var opcionesJson = JsonConvert.SerializeObject(opciones);
        form.Add(new StringContent(opcionesJson), "opciones");
        
        // Enviar request
        var response = await _httpClient.PostAsync($"{BaseUrl}/api/visar", form);
        response.EnsureSuccessStatusCode();
        
        var responseContent = await response.Content.ReadAsStringAsync();
        return JsonConvert.DeserializeObject(responseContent);
    }
}

// Uso
class Program
{
    static async Task Main(string[] args)
    {
        var client = new MedicalOCRClient();
        try
        {
            var resultado = await client.ProcesarOrdenMedica("./orden_medica.pdf");
            Console.WriteLine(JsonConvert.SerializeObject(resultado, Formatting.Indented));
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
        }
    }
}
```

## Java (Spring Boot)

```java
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.io.File;

public class MedicalOCRClient {
    private static final String BASE_URL = "http://localhost:3000";
    private final RestTemplate restTemplate = new RestTemplate();

    public ResponseEntity<String> procesarOrdenMedica(String filePath) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("archivo", new FileSystemResource(new File(filePath)));
        
        String opciones = "{\"extraer_diagnostico\":true,\"detectar_urgencias\":true,\"validar_matricula\":false}";
        body.add("opciones", opciones);

        HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

        return restTemplate.exchange(
            BASE_URL + "/api/visar",
            HttpMethod.POST,
            requestEntity,
            String.class
        );
    }

    public static void main(String[] args) {
        MedicalOCRClient client = new MedicalOCRClient();
        try {
            ResponseEntity<String> response = client.procesarOrdenMedica("./orden_medica.pdf");
            System.out.println(response.getBody());
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
        }
    }
}
```

## Postman Collection (JSON)

```json
{
  "info": {
    "name": "Medical OCR Service",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Procesar Orden Médica",
      "request": {
        "method": "POST",
        "header": [],
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "archivo",
              "type": "file",
              "src": "/path/to/orden_medica.pdf"
            },
            {
              "key": "opciones",
              "value": "{\"extraer_diagnostico\":true,\"detectar_urgencias\":true,\"validar_matricula\":false}",
              "type": "text"
            }
          ]
        },
        "url": {
          "raw": "http://localhost:3000/api/visar",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "visar"]
        }
      }
    },
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "url": {
          "raw": "http://localhost:3000/health",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["health"]
        }
      }
    },
    {
      "name": "Get Metrics",
      "request": {
        "method": "GET",
        "url": {
          "raw": "http://localhost:3000/health/metrics",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["health", "metrics"]
        }
      }
    }
  ]
}
```
