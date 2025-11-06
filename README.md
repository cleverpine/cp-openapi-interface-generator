# cp-openapi-interface-generator

A TypeScript code generator that transforms OpenAPI 3.x specifications into production-ready TypeScript types, Express controller interfaces, and route definitions. Built with a modular architecture for maintainability and extensibility.

## Features

- **TypeScript Type Generation**: Individual model files with automatic dependency resolution
- **Express Controller Interfaces**: Strongly-typed controller interfaces organized by OpenAPI tags
- **Route Generation**: Express route definitions with middleware integration and dependency injection
- **Enum Support**: Full enum generation with `x-enum-varnames` extension support
- **Parameter Type Reusability**: Smart deduplication of path and query parameter types
- **Reference Resolution**: Complete support for OpenAPI `$ref` references
- **Robust Error Handling**: Comprehensive validation and clear error messages
- **Fully Configurable**: Customizable output paths and folder structure

---

## 🛠 Installation

```bash
npm install --save-dev cp-openapi-interface-generator
```

## 🚀 Usage

### Option 1: Add it to your npm scripts

Add this to your package.json:

```json
{
  "scripts": {
    "generate": "cp-openapi-interface-generator --open-api-path=./openapi.yaml --generated-dir=./src/generated"
  }
}
```

### Option 2: CLI

```bash
cp-openapi-interface-generator \
  --open-api-path=./openapi.yaml \
  --generated-dir=./src/generated \
  --controllers-folder=controllers \
  --models-folder=models \
  --routes-folder=routes \
  --middleware-config-path=./middleware-config.js
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
- **Controller binding**: Proper method binding for controller interfaces
- **Path conversion**: OpenAPI paths converted to Express route format

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

## 🏗 Project Structure

The generator is built with a clean modular architecture:

```
src/
├── generate.ts                    # Main orchestrator
├── config/
│   └── constants.ts              # Configuration constants
├── types/
│   └── index.ts                  # TypeScript interfaces
├── utils/
│   ├── converters.ts             # String conversions (PascalCase, kebab-case)
│   ├── file-writer.ts            # File I/O operations
│   └── openapi-resolver.ts       # OpenAPI $ref resolution
├── validators/
│   └── enum-validator.ts         # Enum validation and sanitization
└── generators/
    ├── enum-generator.ts         # Enum generation
    ├── interface-generator.ts    # Interface/type generation
    ├── parameter-extractor.ts    # Parameter extraction
    ├── model-generator.ts        # Model file generation
    ├── controller-generator.ts   # Controller interface generation
    └── route-generator.ts        # Express route generation
```

### Key Components

- **Enum Generation**: Robust enum handling with collision prevention and proper escaping
- **Type Deduplication**: Global tracking prevents duplicate type generation
- **Parameter Reusability**: Shared parameter types across endpoints reduce duplication
- **Dependency Management**: Automatic import generation for type dependencies

## 🔧 Advanced Features

### Enum Generation

The generator provides robust enum support:

- **String escaping**: Handles special characters (backslashes, quotes, newlines, tabs)
- **Key sanitization**: Converts enum values to valid TypeScript identifiers
- **Collision prevention**: Automatic numbering for duplicate keys
- **x-enum-varnames**: Support for custom enum key names via OpenAPI extension

Example:
```yaml
# OpenAPI spec
MessageType:
  type: string
  enum: [TEXT, IMAGE, VIDEO]
  x-enum-varnames: [Text, Image, Video]
```

Generated TypeScript:
```typescript
export enum MessageType {
  Text = 'TEXT',
  Image = 'IMAGE',
  Video = 'VIDEO'
}
```

### Parameter Type Reusability

The generator intelligently reuses parameter types across endpoints:

```typescript
// Reused across multiple endpoints with same parameters
export interface ConversationIdPathParams {
  conversationId: string;
}

// Used in controller interfaces
getConversation(
  req: Request<ConversationIdPathParams, Conversation, void, {}>,
  res: Response<Conversation>
): Promise<void>;
```

### Dependency Injection Pattern

Generated routes follow dependency injection for testability:

```typescript
// Generated route file
export function createRoutes(messageController: MessageInterface): Router {
  const router = Router();
  router.post('/', authenticate, messageController.createMessage.bind(messageController));
  return router;
}

// Usage in your app
import { createRoutes } from './generated/routes/message-routes';
const messageRouter = createRoutes(new MessageController());
app.use('/api/messages', messageRouter);
```

## 🚀 Next Steps

After running the generator:

1. **Create controller implementations**
   ```typescript
   import { MessageInterface } from './generated/controllers/message-interface';

   export class MessageController implements MessageInterface {
     async createMessage(req: Request, res: Response): Promise<void> {
       // Your implementation
     }
   }
   ```

2. **Wire up the generated routes**
   ```typescript
   import { createRoutes as createMessageRoutes } from './generated/routes/message-routes';

   const messageController = new MessageController();
   app.use('/api/messages', createMessageRoutes(messageController));
   ```

3. **Import and use generated models**
   ```typescript
   import { Message, User } from './generated/models';
   ```

## 🐛 Error Handling

The generator provides clear error messages for common issues:

- **Missing OpenAPI spec**: File not found errors with exact path
- **Invalid spec structure**: Validation errors for malformed OpenAPI files
- **Invalid enum values**: Detection of null/undefined in enum definitions
- **File write errors**: Detailed error messages with file paths
- **Middleware config errors**: Clear messages for missing or invalid middleware configuration

## 🤝 Contributing

Contributions are welcome! The modular architecture makes it easy to:

- Add new generators in `src/generators/`
- Add new validators in `src/validators/`
- Add new utilities in `src/utils/`
- Extend existing functionality

## 📝 License

ISC

## 🔗 Related

- [OpenAPI Specification](https://swagger.io/specification/)
- [Express.js](https://expressjs.com/)
- [TypeScript](https://www.typescriptlang.org/) 
