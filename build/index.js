import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import { z } from "zod";
import * as fs from "fs";
import shx from "shelljs";
// Constants
const MEMORY_DIR = "MEMORY_DIR";
const ARCHIVE_DIR = path.join(MEMORY_DIR, "ARCHIVE");
const DIRECTORY_FILE = path.join(MEMORY_DIR, "DIRECTORY.txt");
// JSON Memory Schema
const MemorySchema = z.object({
    timestamp: z.string(),
    id: z.string(),
    tags: z.array(z.string()),
    content: z.string(),
});
// Memory Manager Base Class
class MemoryManager {
    initializeDirectory() {
        if (!fs.existsSync(MEMORY_DIR)) {
            shx.mkdir(MEMORY_DIR);
            shx.mkdir(ARCHIVE_DIR);
            this.updateDirectoryFile();
        }
    }
    updateDirectoryFile() {
        const tree = this.generateDirectoryTree(MEMORY_DIR);
        fs.writeFileSync(DIRECTORY_FILE, tree);
    }
    generateDirectoryTree(dir) {
        let output = `${dir}\n`;
        const items = fs.readdirSync(dir);
        items.forEach((item, index) => {
            const fullPath = path.join(dir, item);
            const isLast = index === items.length - 1;
            const prefix = isLast ? "└── " : "├── ";
            if (fs.statSync(fullPath).isDirectory()) {
                output += `${prefix}${item}/\n`;
                output += this.generateDirectoryTree(fullPath)
                    .split("\n")
                    .map((line) => (isLast ? "    " : "│   ") + line)
                    .join("\n");
            }
            else {
                output += `${prefix}${item}\n`;
            }
        });
        return output;
    }
}
// JSON Mode Memory Manager
class JSONMemoryManager extends MemoryManager {
    memoryGraph = new Map();
    constructor() {
        super();
        this.initializeDirectory();
    }
    connectTags(tags) {
        tags.forEach((tag) => {
            if (!this.memoryGraph.has(tag)) {
                this.memoryGraph.set(tag, new Set());
            }
            tags.forEach((relatedTag) => {
                if (tag !== relatedTag) {
                    this.memoryGraph.get(tag).add(relatedTag);
                }
            });
        });
    }
    createFile(name, content) {
        const memory = {
            timestamp: new Date().toISOString(),
            id: Date.now().toString(),
            tags: [], // Tags should be provided through the tool arguments
            content,
        };
        const filePath = path.join(MEMORY_DIR, `${name}.json`);
        fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
        this.updateDirectoryFile();
    }
    createDir(name) {
        const dirPath = path.join(MEMORY_DIR, name);
        shx.mkdir(dirPath);
        this.updateDirectoryFile();
    }
    moveFile(source, dest) {
        shx.mv(path.join(MEMORY_DIR, source), path.join(MEMORY_DIR, dest));
        this.updateDirectoryFile();
    }
    moveDir(source, dest) {
        shx.mv(path.join(MEMORY_DIR, source), path.join(MEMORY_DIR, dest));
        this.updateDirectoryFile();
    }
    appendContent(file, content) {
        const filePath = path.join(MEMORY_DIR, file);
        const memory = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        memory.content += content;
        memory.timestamp = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
        this.updateDirectoryFile();
    }
    renameFile(oldName, newName) {
        shx.mv(path.join(MEMORY_DIR, oldName), path.join(MEMORY_DIR, newName));
        this.updateDirectoryFile();
    }
    readAllFiles() {
        return fs
            .readdirSync(MEMORY_DIR)
            .filter((file) => file.endsWith(".json"))
            .map((file) => path.join(MEMORY_DIR, file));
    }
    readFileContent(file) {
        const content = fs.readFileSync(path.join(MEMORY_DIR, file), "utf-8");
        return JSON.parse(content).content;
    }
    fuzzySearch(query) {
        const files = this.readAllFiles();
        return files.filter((file) => {
            const content = fs.readFileSync(file, "utf-8");
            const memory = JSON.parse(content);
            return (memory.content.toLowerCase().includes(query.toLowerCase()) ||
                memory.tags.some((tag) => tag.toLowerCase().includes(query.toLowerCase())));
        });
    }
}
// RAW Mode Memory Manager
class RAWMemoryManager extends MemoryManager {
    constructor() {
        super();
        this.initializeDirectory();
    }
    createFile(name, content) {
        fs.writeFileSync(path.join(MEMORY_DIR, name), content);
        this.updateDirectoryFile();
    }
    createDir(name) {
        shx.mkdir(path.join(MEMORY_DIR, name));
        this.updateDirectoryFile();
    }
    moveFile(source, dest) {
        shx.mv(path.join(MEMORY_DIR, source), path.join(MEMORY_DIR, dest));
        this.updateDirectoryFile();
    }
    moveDir(source, dest) {
        shx.mv(path.join(MEMORY_DIR, source), path.join(MEMORY_DIR, dest));
        this.updateDirectoryFile();
    }
    appendContent(file, content) {
        fs.appendFileSync(path.join(MEMORY_DIR, file), content);
        this.updateDirectoryFile();
    }
    renameFile(oldName, newName) {
        shx.mv(path.join(MEMORY_DIR, oldName), path.join(MEMORY_DIR, newName));
        this.updateDirectoryFile();
    }
    readAllFiles() {
        const getAllFiles = (dir) => {
            const files = fs.readdirSync(dir);
            let fileList = [];
            files.forEach((file) => {
                const fullPath = path.join(dir, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    fileList = fileList.concat(getAllFiles(fullPath));
                }
                else {
                    fileList.push(fullPath);
                }
            });
            return fileList;
        };
        return getAllFiles(MEMORY_DIR);
    }
    readFileContent(file) {
        return fs.readFileSync(path.join(MEMORY_DIR, file), "utf-8");
    }
    fuzzySearch(query) {
        return this.readAllFiles().filter((file) => this.readFileContent(file).toLowerCase().includes(query.toLowerCase()));
    }
}
// MCP Server Setup
const server = new Server({
    name: "living-memory",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// Initialize memory managers
const jsonManager = new JSONMemoryManager();
const rawManager = new RAWMemoryManager();
// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "MODE_JSON",
                description: "Interact with memory in JSON mode with structured data and memory graphs",
                inputSchema: {
                    type: "object",
                    properties: {
                        action: {
                            type: "string",
                            enum: [
                                "create_file",
                                "create_dir",
                                "move_file",
                                "move_dir",
                                "append_content",
                                "rename_file",
                                "read_all_files",
                                "read_file_content",
                                "fuzzy_search",
                            ],
                        },
                        name: { type: "string" },
                        content: { type: "string" },
                        tags: { type: "array", items: { type: "string" } },
                        source: { type: "string" },
                        dest: { type: "string" },
                        query: { type: "string" },
                    },
                    required: ["action"],
                },
            },
            {
                name: "MODE_RAW",
                description: "Interact with memory in RAW mode for direct filesystem access",
                inputSchema: {
                    type: "object",
                    properties: {
                        action: {
                            type: "string",
                            enum: [
                                "create_file",
                                "create_dir",
                                "move_file",
                                "move_dir",
                                "append_content",
                                "rename_file",
                                "read_all_files",
                                "read_file_content",
                                "fuzzy_search",
                            ],
                        },
                        name: { type: "string" },
                        content: { type: "string" },
                        source: { type: "string" },
                        dest: { type: "string" },
                        query: { type: "string" },
                    },
                    required: ["action"],
                },
            },
        ],
    };
});
// Tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        const manager = name === "MODE_JSON" ? jsonManager : rawManager;
        const action = args?.action;
        let result;
        switch (action) {
            case "create_file":
                if (!args?.name ||
                    !args?.content ||
                    typeof args.name !== "string" ||
                    typeof args.content !== "string") {
                    throw new Error("Name and content are required for creating a file");
                }
                manager.createFile(args.name, args.content);
                result = `File ${args.name} created successfully`;
                break;
            case "create_dir":
                if (!args?.name || typeof args.name !== "string") {
                    throw new Error("Name is required for creating a directory");
                }
                manager.createDir(args.name);
                result = `Directory ${args.name} created successfully`;
                break;
            case "move_file":
                if (!args?.source ||
                    !args?.dest ||
                    typeof args.source !== "string" ||
                    typeof args.dest !== "string") {
                    throw new Error("Source and destination are required for moving a file");
                }
                manager.moveFile(args.source, args.dest);
                result = `File moved from ${args.source} to ${args.dest}`;
                break;
            case "move_dir":
                if (!args?.source ||
                    !args?.dest ||
                    typeof args.source !== "string" ||
                    typeof args.dest !== "string") {
                    throw new Error("Source and destination are required for moving a directory");
                }
                manager.moveDir(args.source, args.dest);
                result = `Directory moved from ${args.source} to ${args.dest}`;
                break;
            case "append_content":
                if (!args?.name ||
                    !args?.content ||
                    typeof args.name !== "string" ||
                    typeof args.content !== "string") {
                    throw new Error("Name and content are required for appending content");
                }
                manager.appendContent(args.name, args.content);
                result = `Content appended to ${args.name}`;
                break;
            case "rename_file":
                if (!args?.source ||
                    !args?.dest ||
                    typeof args.source !== "string" ||
                    typeof args.dest !== "string") {
                    throw new Error("Source and destination are required for renaming a file");
                }
                manager.renameFile(args.source, args.dest);
                result = `File renamed from ${args.source} to ${args.dest}`;
                break;
            case "read_all_files":
                result = manager.readAllFiles().join("\n");
                break;
            case "read_file_content":
                if (!args?.name || typeof args.name !== "string") {
                    throw new Error("Name is required for reading file content");
                }
                result = manager.readFileContent(args.name);
                break;
            case "fuzzy_search":
                if (!args?.query || typeof args.query !== "string") {
                    throw new Error("Query is required for fuzzy search");
                }
                result = manager.fuzzySearch(args.query).join("\n");
                break;
            default:
                throw new Error(`Unknown action: ${action}`);
        }
        return {
            content: [
                {
                    type: "text",
                    text: result,
                },
            ],
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${errorMessage}`,
                },
            ],
        };
    }
});
// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Living Memory MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
