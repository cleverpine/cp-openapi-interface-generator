# openapi-interface-generator

A simple TypeScript utility to generate strongly typed contracts (input, output, and interfaces) based on an OpenAPI YAML specification. This tool helps backend and frontend developers work with consistent request and response types.

## Features

- Generate TypeScript interfaces from OpenAPI schemas
- Organize input (request), output (response), and controller interfaces
- Supports nested objects and `$ref` references
- Fully configurable output paths

---

## 🛠 Installation

```bash
npm install --save-dev openapi-interface-generator
```

## 🚀 Usage

### Option 1: CLI (Locally or via npm script):

```bash
ts-node utils/generate-openapi-interfaces.ts \
  --openApiPath=./openapi.yaml \
  --generatedDir=./src/app/contracts \
  --interfacesFolder=interfaces \
  --requestsFolder=requests \
  --responsesFolder=responses
```

### Option 2: You can add it to your npm scripts

Add this to your package.json:

```bash
"scripts": {
    "generate-interfaces": "ts-node utils/generate-openapi-interfaces.ts --openApiPath=./openapi.yaml --generatedDir=./src/app/contracts --interfacesFolder=interfaces --requestsFolder=requests --responsesFolder=responses"
}
```

### Running using the npm script
```bash
npm run generate-interfaces
```

## ⚙ CLI Options

| Option               | Description                                  | Default                  |
|----------------------|----------------------------------------------|--------------------------|
| `--openApiPath`      | Path to OpenAPI YAML file                    | `./openapi.yaml`         |
| `--generatedDir`     | Base output folder for all contracts         | `./src/app/contracts`    |
| `--interfacesFolder` | Folder for generated Express interfaces      | `interfaces`             |
| `--requestsFolder`   | Folder for generated request DTOs            | `requests`               |
| `--responsesFolder`  | Folder for generated response DTOs           | `responses`              |



## 📂 Output Structure

```bash
/contracts
  ├── interfaces
  │   └── tag-name-interface.ts     <-- Controller interfaces
  ├── requests
  │   └── tag-name.request.ts       <-- Input DTOs
  └── responses
      └── tag-name.response.ts      <-- Output DTOs
```
