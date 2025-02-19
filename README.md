# Living Memory System

![GitHub](https://img.shields.io/badge/license-GPL--3.0-blue.svg)
![Visitors](https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2FXroSilence%2Fliving-memory&countColor=%23263759)

## 🧠 Overview

Living Memory is a sophisticated filesystem-based memory system that provides two powerful modes of operation: RAW and JSON. This system enables intelligent data organization, retrieval, and management through a flexible and intuitive interface.

## 🛠️ Core Features

### RAW Mode Operations

- `create_file`: Create plain text files
- `create_dir`: Create directories
- `move_file`: Move files between locations
- `move_dir`: Move directories
- `append_content`: Add content to existing files
- `rename_file`: Rename files
- `read_all_files`: List all files in the system
- `read_file_content`: Read file contents
- `fuzzy_search`: Search through files

### JSON Mode Enhancements

- Tag-based organization
- Structured data storage
- Enhanced search capabilities
- Metadata management
- Automatic JSON formatting

## 💡 Use Cases

1. **Knowledge Management**

   - Personal knowledge bases
   - Research documentation
   - Project wikis
   - Learning resources

2. **Data Organization**

   - Structured content management
   - Tagged file systems
   - Hierarchical information storage
   - Version tracking

3. **Information Retrieval**
   - Smart searching
   - Content discovery
   - Relationship mapping
   - Context preservation

## 🎯 Prompting Examples

### RAW Mode

```javascript
// Create a new file
MODE_RAW.create_file({
  name: "notes.txt",
  content: "Important meeting notes",
});

// Move a file
MODE_RAW.move_file({
  source: "old/path.txt",
  dest: "new/path.txt",
});
```

### JSON Mode

```javascript
// Create a tagged file
MODE_JSON.create_file({
  name: "project_alpha.txt",
  tags: ["project", "alpha", "documentation"],
  content: {
    title: "Project Alpha",
    status: "active",
    priority: "high",
  },
});

// Fuzzy search
MODE_JSON.fuzzy_search({
  query: "alpha project",
});
```

## 🚀 Capabilities

### File Management

- Create, read, update, and delete operations
- Directory structure maintenance
- File movement and organization
- Content appending and modification

### Search & Discovery

- Full-text search
- Tag-based filtering
- Fuzzy matching
- Pattern recognition

### Data Structure

- Flexible content formats
- Metadata management
- Relationship mapping
- Version control support

### Security

- File integrity checks
- Access control
- Data validation
- Error handling

## 📝 Implementation Notes

The system utilizes a hybrid approach combining traditional filesystem operations with enhanced JSON-based storage:

1. **RAW Mode** provides direct filesystem access for basic operations
2. **JSON Mode** adds a layer of structured data management
3. Files in JSON mode automatically receive the `.json` extension
4. Tags provide additional context and improved searchability
5. Both modes support comprehensive error handling

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 👤 Author

**XroSilence**

---

<small>Made with 💡 by XroSilence | GPL-3.0 License</small>
