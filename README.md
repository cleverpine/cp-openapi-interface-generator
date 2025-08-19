# openapi-interface-generator

A TypeScript utility to generate strongly typed contracts, interfaces, and Express routes from an OpenAPI YAML specification. This tool creates modular TypeScript models, Express controller interfaces, and route definitions with middleware support.

## Features

- Generate modular TypeScript interfaces from OpenAPI schemas
- Create Express controller interfaces organized by OpenAPI tags
- Generate Express route definitions with middleware integration
- Support for nested objects and `$ref` references
- Reusable parameter types for path and query parameters
- Individual model files with proper dependency imports
- Fully configurable output paths

---

## 🛠 Installation

```bash
npm install --save-dev openapi-interface-generator
```

## 🚀 Usage

### Option 1: Add it to your npm scripts

Add this to your package.json:

```json
{
  "scripts": {
    "generate": "openapi-interface-generator --open-api-path=./openapi.yaml --generated-dir=./src/generated"
  }
}
```

### Option 2: CLI

```bash
openapi-interface-generator \
  --open-api-path=./openapi.yaml \
  --generated-dir=./src/generated \
  --controllers-folder=controllers \
  --models-folder=models \
  --routes-folder=routes \
  --middleware-config-path=./middleware-config.js \
  --controllers-impl-path=../../controllers/impl
```

### Running using the npm script
```bash
npm run generate
```

## ⚙ CLI Options

| Option                     | Description                                | Default                    |
|----------------------------|--------------------------------------------|----------------------------|
| `--open-api-path`          | Path to OpenAPI YAML file                 | `./openapi.yaml`           |
| `--generated-dir`          | Base output folder for all generated files| `./src/generated`          |
| `--controllers-folder`     | Folder for Express controller interfaces  | `controllers`              |
| `--models-folder`          | Folder for TypeScript model files         | `models`                   |
| `--routes-folder`          | Folder for Express route definitions      | `routes`                   |
| `--middleware-config-path` | Path to middleware configuration file     | `./middleware-config.js`   |
| `--controllers-impl-path`  | Relative path from routes to controller implementations | `../../controllers/impl`   |

## 📂 Output Structure

```bash
/src/generated
  ├── models/
  │   ├── index.ts                    <-- Exports all models
  │   ├── UserModel.ts                <-- Individual model files
  │   ├── MessageModel.ts             <-- with dependency imports
  │   └── ...
  ├── controllers/
  │   ├── user-interface.ts           <-- Express controller interfaces
  │   ├── message-interface.ts        <-- organized by OpenAPI tags
  │   └── ...
  └── routes/
      ├── user-routes.ts              <-- Express route definitions
      ├── message-routes.ts           <-- with middleware integration
      └── ...
```

## 📋 Generated Files

### Models (`models/` folder)
- **Individual model files**: One TypeScript file per schema type
- **Dependency management**: Automatic imports for referenced types
- **Index file**: Central export point for all models
- **Reusable parameter types**: Shared path and query parameter interfaces

### Controllers (`controllers/` folder)
- **Express controller interfaces**: Type-safe method signatures
- **Request/Response typing**: Strongly typed Express Request/Response objects
- **Parameter typing**: Path and query parameters with proper types
- **Tag organization**: One interface file per OpenAPI tag

### Routes (`routes/` folder)
- **Express route definitions**: Ready-to-use router configurations
- **Middleware integration**: Automatic middleware application based on configuration
- **Controller binding**: Proper method binding for controller implementations
- **Path conversion**: OpenAPI paths converted to Express route format
- **Controller imports**: Uses `--controllers-impl-path` as relative path from routes directory

## 🛠 Middleware Configuration

Create a `middleware-config.js` file to define middleware for your routes:

```javascript
module.exports = {
  getMiddleware: (operationId, method, tags) => {
    // Return array of middleware function names
    if (tags.includes('auth')) return ['authenticate', 'authorize'];
    return [];
  },
  getMiddlewareImport: (middlewareName) => {
    // Return import statement for middleware
    return `require('../middleware/${middlewareName}')`;
  }
};
```

## 🚀 Next Steps

After running the generator:

1. **Create controller implementations** in your configured controllers implementation path
2. **Implement each controller method** to call your existing endpoint logic  
3. **Wire up the generated routes** 
