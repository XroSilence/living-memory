import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import { z } from "zod";
import * as fs from "fs";
import shx from "shelljs";

// Path resolution helper
function resolveBuildPath() {
  try {
    // Get the directory where the compiled JS file is located
    const buildDir = path.dirname(process.argv[1]);
    console.error(`Build directory detected as: ${buildDir}`);
    return buildDir;
  } catch (error) {
    console.error(`Error resolving build path: ${error}`);
    // Fallback to current working directory
    return process.cwd();
  }
}

// Constants with proper path resolution
const BUILD_DIR = resolveBuildPath();
const MEMORY_DIR = path.join(BUILD_DIR, "MEMORY_DIR");
const ARCHIVE_DIR = path.join(MEMORY_DIR, "ARCHIVE");
const DIRECTORY_FILE = path.join(MEMORY_DIR, "DIRECTORY.txt");

// JSON Memory Schema
const MemorySchema = z.object({
  timestamp: z.string(),
  id: z.string(),
  tags: z.array(z.string()),
  content: z.string(),
});

const ListPromptsRequestSchema = z.object({
  method: z.literal("prompts/list"),
  params: z.object({}).optional(),
});

// Error classes for better error handling
class MemoryManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryManagerError";
  }
}

class FileOperationError extends MemoryManagerError {
  constructor(operation: string, path: string, error: unknown) {
    super(
      `Failed to ${operation} at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
    this.name = "FileOperationError";
  }
}
// Memory Manager Base Class
abstract class MemoryManager {
  protected initializeDirectory() {
    try {
      if (!fs.existsSync(MEMORY_DIR)) {
        console.error(`Creating memory directory at: ${MEMORY_DIR}`);
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
        fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
        this.updateDirectoryFile();
      }
    } catch (error) {
      throw new FileOperationError("initialize directories", MEMORY_DIR, error);
    }
  }

  protected updateDirectoryFile() {
    try {
      const tree = this.generateDirectoryTree(MEMORY_DIR);
      fs.writeFileSync(DIRECTORY_FILE, tree);
    } catch (error) {
      throw new FileOperationError(
        "update directory file",
        DIRECTORY_FILE,
        error,
      );
    }
  }

  private generateDirectoryTree(dir: string): string {
    try {
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
        } else {
          output += `${prefix}${item}\n`;
        }
      });

      return output;
    } catch (error) {
      throw new FileOperationError("generate directory tree", dir, error);
    }
  }

  abstract createFile(name: string, content: string): void;
  abstract createDir(name: string): void;
  abstract moveFile(source: string, dest: string): void;
  abstract moveDir(source: string, dest: string): void;
  abstract appendContent(file: string, content: string): void;
  abstract renameFile(oldName: string, newName: string): void;
  abstract readAllFiles(): string[];
  abstract readFileContent(file: string): string;
  abstract fuzzySearch(query: string): string[];
}

// JSON Mode Memory Manager
class JSONMemoryManager extends MemoryManager {
  private memoryGraph: Map<string, Set<string>> = new Map();

  constructor() {
    super();
    this.initializeDirectory();
  }

  private connectTags(tags: string[]) {
    tags.forEach((tag) => {
      if (!this.memoryGraph.has(tag)) {
        this.memoryGraph.set(tag, new Set());
      }

      tags.forEach((relatedTag) => {
        if (tag !== relatedTag) {
          this.memoryGraph.get(tag)!.add(relatedTag);
        }
      });
    });
  }

  createFile(name: string, content: string) {
    try {
      const memory = {
        timestamp: new Date().toISOString(),
        id: Date.now().toString(),
        tags: [], // Tags should be provided through the tool arguments
        content,
      };

      const filePath = path.join(MEMORY_DIR, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
      this.updateDirectoryFile();
    } catch (error) {
      throw new FileOperationError("create JSON file", name, error);
    }
  }

  createDir(name: string) {
    try {
      const dirPath = path.join(MEMORY_DIR, name);
      fs.mkdirSync(dirPath, { recursive: true });
      this.updateDirectoryFile();
    } catch (error) {
      throw new FileOperationError("create directory", name, error);
    }
  }

  moveFile(source: string, dest: string) {
    try {
      const sourcePath = path.join(MEMORY_DIR, source);
      const destPath = path.join(MEMORY_DIR, dest);
      fs.renameSync(sourcePath, destPath);
      this.updateDirectoryFile();
    } catch (error) {
      throw new FileOperationError("move file", `${source} to ${dest}`, error);
    }
  }

  moveDir(source: string, dest: string) {
    try {
      const sourcePath = path.join(MEMORY_DIR, source);
      const destPath = path.join(MEMORY_DIR, dest);
      fs.renameSync(sourcePath, destPath);
      this.updateDirectoryFile();
    } catch (error) {
      throw new FileOperationError(
        "move directory",
        `${source} to ${dest}`,
        error,
      );
    }
  }

  appendContent(file: string, content: string) {
    try {
      const filePath = path.join(MEMORY_DIR, file);
      const memory = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      memory.content += content;
      memory.timestamp = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
      this.updateDirectoryFile();
    } catch (error) {
      throw new FileOperationError("append content", file, error);
    }
  }

  renameFile(oldName: string, newName: string) {
    try {
      const oldPath = path.join(MEMORY_DIR, oldName);
      const newPath = path.join(MEMORY_DIR, newName);
      fs.renameSync(oldPath, newPath);
      this.updateDirectoryFile();
    } catch (error) {
      throw new FileOperationError(
        "rename file",
        `${oldName} to ${newName}`,
        error,
      );
    }
  }

  readAllFiles() {
    try {
      return fs
        .readdirSync(MEMORY_DIR)
        .filter((file) => file.endsWith(".json"))
        .map((file) => path.join(MEMORY_DIR, file));
    } catch (error) {
      throw new FileOperationError("read all files", MEMORY_DIR, error);
    }
  }

  readFileContent(file: string) {
    try {
      const content = fs.readFileSync(path.join(MEMORY_DIR, file), "utf-8");
      return JSON.parse(content).content;
    } catch (error) {
      throw new FileOperationError("read file content", file, error);
    }
  }

  fuzzySearch(query: string) {
    try {
      const files = this.readAllFiles();
      return files.filter((file) => {
        const content = fs.readFileSync(file, "utf-8");
        const memory = JSON.parse(content);
        return (
          memory.content.toLowerCase().includes(query.toLowerCase()) ||
          memory.tags.some((tag: string) =>
            tag.toLowerCase().includes(query.toLowerCase()),
          )
        );
      });
    } catch (error) {
      throw new FileOperationError("fuzzy search", query, error);
    }
  }
}
// RAW Mode Memory Manager
class RAWMemoryManager extends MemoryManager {
  constructor() {
    super();
    this.initializeDirectory();
  }

  createFile(name: string, content: string) {
    try {
      fs.writeFileSync(path.join(MEMORY_DIR, name), content);
      this.updateDirectoryFile();
    } catch (error) {
      throw new FileOperationError("create RAW file", name, error);
    }
  }

  createDir(name: string) {
    try {
      fs.mkdirSync(path.join(MEMORY_DIR, name), { recursive: true });
      this.updateDirectoryFile();
    } catch (error) {
      throw new FileOperationError("create directory", name, error);
    }
  }

  moveFile(source: string, dest: string) {
    try {
      const sourcePath = path.join(MEMORY_DIR, source);
      const destPath = path.join(MEMORY_DIR, dest);
      fs.renameSync(sourcePath, destPath);
      this.updateDirectoryFile();
    } catch (error) {
      throw new FileOperationError("move file", `${source} to ${dest}`, error);
    }
  }

  moveDir(source: string, dest: string) {
    try {
      const sourcePath = path.join(MEMORY_DIR, source);
      const destPath = path.join(MEMORY_DIR, dest);
      fs.renameSync(sourcePath, destPath);
      this.updateDirectoryFile();
    } catch (error) {
      throw new FileOperationError(
        "move directory",
        `${source} to ${dest}`,
        error,
      );
    }
  }

  appendContent(file: string, content: string) {
    try {
      fs.appendFileSync(path.join(MEMORY_DIR, file), content);
      this.updateDirectoryFile();
    } catch (error) {
      throw new FileOperationError("append content", file, error);
    }
  }

  renameFile(oldName: string, newName: string) {
    try {
      const oldPath = path.join(MEMORY_DIR, oldName);
      const newPath = path.join(MEMORY_DIR, newName);
      fs.renameSync(oldPath, newPath);
      this.updateDirectoryFile();
    } catch (error) {
      throw new FileOperationError(
        "rename file",
        `${oldName} to ${newName}`,
        error,
      );
    }
  }

  readAllFiles() {
    const getAllFiles = (dir: string): string[] => {
      try {
        const files = fs.readdirSync(dir);
        let fileList: string[] = [];

        files.forEach((file) => {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory()) {
            fileList = fileList.concat(getAllFiles(fullPath));
          } else {
            fileList.push(fullPath);
          }
        });

        return fileList;
      } catch (error) {
        throw new FileOperationError("read directory", dir, error);
      }
    };

    return getAllFiles(MEMORY_DIR);
  }

  readFileContent(file: string) {
    try {
      return fs.readFileSync(path.join(MEMORY_DIR, file), "utf-8");
    } catch (error) {
      throw new FileOperationError("read file content", file, error);
    }
  }

  fuzzySearch(query: string) {
    try {
      return this.readAllFiles().filter((file) =>
        this.readFileContent(file).toLowerCase().includes(query.toLowerCase()),
      );
    } catch (error) {
      throw new FileOperationError("fuzzy search", query, error);
    }
  }
}

// MCP Server Setup
const server = new Server(
  {
    name: "living-memory",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {}, // Add prompts capability
    },
  },
);

// Initialize memory managers
const jsonManager = new JSONMemoryManager();
const rawManager = new RAWMemoryManager();

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "MODE_JSON",
        template:
          "Execute {action} operation in structured JSON mode.\nParameters:\n- name: {name}\n- content: {content}\n- tags: {tags}\n- source: {source}\n- dest: {dest}\n- query: {query}\n\nEnsure all parameters conform to JSON schema specifications.",
        description:
          "Template for JSON mode operations with structured data and memory graphs",
      },
      {
        name: "MODE_RAW",
        template:
          "Execute {action} operation in raw filesystem mode.\nParameters:\n- name: {name}\n- content: {content}\n- source: {source}\n- dest: {dest}\n- query: {query}\n\nDirect filesystem manipulation without structured constraints.",
        description:
          "Template for RAW mode operations with direct filesystem access",
      },
    ],
  };
});

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("Handling list tools request");
  return {
    tools: [
      {
        name: "MODE_JSON",
        description:
          "Interact with memory in JSON mode with structured data and memory graphs",
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
        description:
          "Interact with memory in RAW mode for direct filesystem access",
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
  console.error(`Handling tool request: ${name}, action: ${args?.action}`);

  try {
    const manager = name === "MODE_JSON" ? jsonManager : rawManager;
    const action = args?.action;

    let result;
    switch (action) {
      case "create_file":
        if (
          !args?.name ||
          !args?.content ||
          typeof args.name !== "string" ||
          typeof args.content !== "string"
        ) {
          throw new MemoryManagerError(
            "Name and content are required for creating a file",
          );
        }
        manager.createFile(args.name, args.content);
        result = `File ${args.name} created successfully in ${MEMORY_DIR}`;
        break;

      case "create_dir":
        if (!args?.name || typeof args.name !== "string") {
          throw new MemoryManagerError(
            "Name is required for creating a directory",
          );
        }
        manager.createDir(args.name);
        result = `Directory ${args.name} created successfully in ${MEMORY_DIR}`;
        break;

      case "move_file":
        if (
          !args?.source ||
          !args?.dest ||
          typeof args.source !== "string" ||
          typeof args.dest !== "string"
        ) {
          throw new MemoryManagerError(
            "Source and destination are required for moving a file",
          );
        }
        manager.moveFile(args.source, args.dest);
        result = `File moved from ${args.source} to ${args.dest} in ${MEMORY_DIR}`;
        break;

      case "move_dir":
        if (
          !args?.source ||
          !args?.dest ||
          typeof args.source !== "string" ||
          typeof args.dest !== "string"
        ) {
          throw new MemoryManagerError(
            "Source and destination are required for moving a directory",
          );
        }
        manager.moveDir(args.source, args.dest);
        result = `Directory moved from ${args.source} to ${args.dest} in ${MEMORY_DIR}`;
        break;

      case "append_content":
        if (
          !args?.name ||
          !args?.content ||
          typeof args.name !== "string" ||
          typeof args.content !== "string"
        ) {
          throw new MemoryManagerError(
            "Name and content are required for appending content",
          );
        }
        manager.appendContent(args.name, args.content);
        result = `Content appended to ${args.name} in ${MEMORY_DIR}`;
        break;

      case "rename_file":
        if (
          !args?.source ||
          !args?.dest ||
          typeof args.source !== "string" ||
          typeof args.dest !== "string"
        ) {
          throw new MemoryManagerError(
            "Source and destination are required for renaming a file",
          );
        }
        manager.renameFile(args.source, args.dest);
        result = `File renamed from ${args.source} to ${args.dest} in ${MEMORY_DIR}`;
        break;

      case "read_all_files":
        result = manager.readAllFiles().join("\n");
        break;

      case "read_file_content":
        if (!args?.name || typeof args.name !== "string") {
          throw new MemoryManagerError(
            "Name is required for reading file content",
          );
        }
        result = manager.readFileContent(args.name);
        break;

      case "fuzzy_search":
        if (!args?.query || typeof args.query !== "string") {
          throw new MemoryManagerError("Query is required for fuzzy search");
        }
        result = manager.fuzzySearch(args.query).join("\n");
        break;

      default:
        throw new MemoryManagerError(`Unknown action: ${action}`);
    }

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  } catch (error) {
    console.error(`Error in tool execution:`, error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
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
  try {
    console.error(`Starting Enhanced Living Memory MCP Server`);
    console.error(`Memory directory will be created at: ${MEMORY_DIR}`);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Enhanced Living Memory MCP Server running on stdio");
  } catch (error) {
    console.error("Fatal error during server startup:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
