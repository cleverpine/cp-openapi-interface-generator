"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const yamljs_1 = __importDefault(require("yamljs"));
const minimist_1 = __importDefault(require("minimist"));
const args = (0, minimist_1.default)(process.argv.slice(2), {
    alias: {
        'open-api-path': 'openApiPath',
        'generated-dir': 'generatedDir',
        'interfaces-folder': 'interfacesFolder',
        'requests-folder': 'requestsFolder',
        'responses-folder': 'responsesFolder',
    },
});
const openApiPath = args['open-api-path'] || './openapi.yaml';
const generatedDir = args['generated-dir'] || './src/app/contracts';
const interfacesFolder = args['interfaces-folder'] || 'interfaces';
const inputFolder = args['requests-folder'] || 'requests';
const outputFolder = args['responses-folder'] || 'responses';
const interfaceDir = `${generatedDir}/${interfacesFolder}`;
const inputDir = `${generatedDir}/${inputFolder}`;
const outputDir = `${generatedDir}/${outputFolder}`;
const outputDirs = [interfaceDir, inputDir, outputDir];
outputDirs.forEach((dir) => {
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
});
const toPascalCase = (name) => name
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .replace(/(?:^|\s|_)(\w)/g, (_, c) => c.toUpperCase())
    .replace(/\s+/g, '');
const toKebabCase = (name) => name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
function resolveRef(ref, spec) {
    const parts = ref.replace(/^#\//, '').split('/');
    return parts.reduce((acc, part) => acc?.[part], spec);
}
function extractSchemaFromResponse(responses, spec) {
    if (responses['200']?.content?.['application/json']?.schema) {
        const schema = responses['200'].content['application/json'].schema;
        if (schema.$ref)
            return resolveRef(schema.$ref, spec);
        if (schema.type === 'array' && schema.items?.$ref) {
            const resolvedItems = resolveRef(schema.items.$ref, spec);
            return resolvedItems ? { type: 'array', items: resolvedItems } : undefined;
        }
        return schema;
    }
    return undefined;
}
const seenTypes = new Set();
function toTsType(value, name, nestedInterfaces, spec) {
    if (value.$ref) {
        const ref = resolveRef(value.$ref, spec);
        if (ref) {
            const typeName = toPascalCase(name);
            if (!seenTypes.has(typeName)) {
                seenTypes.add(typeName);
                nestedInterfaces.push(generateInterface(typeName, ref, spec, nestedInterfaces, false));
            }
            return typeName;
        }
        return 'any';
    }
    if (value.type === 'array') {
        const items = value.items;
        if (items?.$ref) {
            const ref = resolveRef(items.$ref, spec);
            if (ref) {
                const typeName = toPascalCase(`${name}Item`);
                if (!seenTypes.has(typeName)) {
                    seenTypes.add(typeName);
                    nestedInterfaces.push(generateInterface(typeName, ref, spec, nestedInterfaces, false));
                }
                return `${typeName}[]`;
            }
        }
        else if (items?.type === 'object' || items?.properties) {
            const typeName = toPascalCase(`${name}Item`);
            if (!seenTypes.has(typeName)) {
                seenTypes.add(typeName);
                nestedInterfaces.push(generateInterface(typeName, items, spec, nestedInterfaces, false));
            }
            return `${typeName}[]`;
        }
        else {
            return `${items?.type ?? 'any'}[]`;
        }
    }
    if (value.type === 'object' || value.properties) {
        const typeName = toPascalCase(`${name}Item`);
        if (!seenTypes.has(typeName)) {
            seenTypes.add(typeName);
            nestedInterfaces.push(generateInterface(typeName, value, spec, nestedInterfaces, false));
        }
        return typeName;
    }
    switch (value.type) {
        case 'integer':
        case 'number':
            return 'number';
        case 'string':
            return 'string';
        case 'boolean':
            return 'boolean';
        default:
            return 'any';
    }
}
function generateInterface(name, schema, spec, nestedInterfaces = [], exportMain = true) {
    if (!schema || (!schema.properties && !schema.type))
        return `${exportMain ? 'export ' : ''}type ${name} = any;`;
    if (schema.type === 'array' && schema.items) {
        const itemName = toPascalCase(`${name}Item`);
        const itemSchema = schema.items.$ref ? resolveRef(schema.items.$ref, spec) : schema.items;
        if (itemSchema) {
            if (!seenTypes.has(itemName)) {
                seenTypes.add(itemName);
                nestedInterfaces.push(generateInterface(itemName, itemSchema, spec, nestedInterfaces, false));
            }
            return `${exportMain ? 'export ' : ''}type ${name} = ${itemName}[];`;
        }
        return `${exportMain ? 'export ' : ''}type ${name} = any[];`;
    }
    const lines = [`${exportMain ? 'export ' : ''}interface ${name} {`];
    for (const [prop, val] of Object.entries(schema.properties || {})) {
        const value = val;
        const optional = schema.required?.includes(prop) ? '' : '?';
        const tsType = toTsType(value, `${name}${toPascalCase(prop)}`, nestedInterfaces, spec);
        lines.push(`  ${prop}${optional}: ${tsType};`);
    }
    lines.push('}');
    return lines.join('\n');
}
const spec = yamljs_1.default.load(openApiPath);
const groupedByTag = {};
for (const [route, methods] of Object.entries(spec.paths)) {
    for (const [method, config] of Object.entries(methods)) {
        const fnName = config.operationId;
        const tags = config.tags ?? ['DefaultController'];
        const requestBody = config.requestBody?.content?.['application/json']?.schema;
        const responseBody = config.responses ? extractSchemaFromResponse(config.responses, spec) : undefined;
        if (!fnName)
            continue;
        tags.forEach((tag) => {
            if (!groupedByTag[tag])
                groupedByTag[tag] = [];
            groupedByTag[tag].push({ fnName, method, path: route, requestBody, responseBody });
        });
    }
}
Object.entries(groupedByTag).forEach(([tag, methods]) => {
    const interfaceName = `${toPascalCase(tag)}Interface`;
    const fileBase = toKebabCase(tag);
    const interfaceFile = path_1.default.join(interfaceDir, `${fileBase}-interface.ts`);
    const interfaceLines = [];
    const inputContracts = [];
    const outputContracts = [];
    interfaceLines.push(`import { Request, Response } from 'express';`);
    interfaceLines.push(`import * as Input from '../${inputFolder}/${fileBase}.request';`);
    interfaceLines.push(`import * as Output from '../${outputFolder}/${fileBase}.response';`);
    interfaceLines.push('');
    interfaceLines.push(`export interface ${interfaceName} {`);
    methods.forEach(({ fnName, requestBody, responseBody }) => {
        const reqName = toPascalCase(`${fnName}Request`);
        const resName = toPascalCase(`${fnName}Response`);
        const reqType = `Input.${reqName}`;
        const resType = `Output.${resName}`;
        interfaceLines.push(`  ${fnName}(req: Request<any, any, ${reqType}>, res: Response<${resType}>): Promise<void>;`);
        const nestedInput = [];
        const nestedOutput = [];
        if (requestBody) {
            const main = generateInterface(reqName, requestBody, spec, nestedInput);
            inputContracts.push(...nestedInput, main);
        }
        else {
            inputContracts.push(`export type ${reqName} = any;`);
        }
        if (responseBody) {
            const main = generateInterface(resName, responseBody, spec, nestedOutput);
            outputContracts.push(...nestedOutput, main);
        }
        else {
            outputContracts.push(`export type ${resName} = any;`);
        }
    });
    interfaceLines.push(`}`);
    fs_1.default.writeFileSync(interfaceFile, interfaceLines.join('\n'));
    console.log(`✅ Interface file created: ${interfaceFile}`);
    const inputFile = path_1.default.join(inputDir, `${fileBase}.request.ts`);
    fs_1.default.writeFileSync(inputFile, inputContracts.join('\n\n'));
    console.log(`✅ Input contract file created: ${inputFile}`);
    const outputFile = path_1.default.join(outputDir, `${fileBase}.response.ts`);
    fs_1.default.writeFileSync(outputFile, outputContracts.join('\n\n'));
    console.log(`✅ Output contract file created: ${outputFile}`);
});
