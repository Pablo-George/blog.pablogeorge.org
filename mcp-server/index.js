#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.BLOG_DB_PATH || path.join(__dirname, '..', 'blog.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function getUser() {
  const username = process.env.BLOG_USERNAME;
  if (username) {
    return db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
  }
  return db.prepare('SELECT id, username FROM users LIMIT 1').get();
}

const server = new Server(
  { name: 'blog-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_posts',
      description: 'List blog posts. Filter by status: draft, published, or all',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['draft', 'published', 'all'],
            description: 'Filter by post status (default: all)',
          },
          limit: {
            type: 'number',
            description: 'Max number of posts to return (default: 20)',
          },
        },
      },
    },
    {
      name: 'get_post',
      description: 'Get a single blog post by ID, including full content',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Post ID' },
        },
        required: ['id'],
      },
    },
    {
      name: 'create_post',
      description: 'Create a new blog post',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Post title' },
          content: { type: 'string', description: 'Post body in Markdown' },
          excerpt: { type: 'string', description: 'Short summary shown on listing pages (optional)' },
          status: {
            type: 'string',
            enum: ['draft', 'published'],
            description: 'Post status (default: draft)',
          },
          featured_image: { type: 'string', description: 'Featured image URL (optional)' },
        },
        required: ['title', 'content'],
      },
    },
    {
      name: 'update_post',
      description: 'Update fields on an existing blog post. Only provided fields are changed.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Post ID' },
          title: { type: 'string', description: 'New title' },
          content: { type: 'string', description: 'New body in Markdown' },
          excerpt: { type: 'string', description: 'New excerpt' },
          status: {
            type: 'string',
            enum: ['draft', 'published'],
            description: 'New status',
          },
          featured_image: { type: 'string', description: 'New featured image URL' },
        },
        required: ['id'],
      },
    },
    {
      name: 'publish_post',
      description: 'Publish a draft post (sets status to published)',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Post ID' },
        },
        required: ['id'],
      },
    },
    {
      name: 'unpublish_post',
      description: 'Revert a published post back to draft',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Post ID' },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_post',
      description: 'Permanently delete a blog post',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Post ID' },
        },
        required: ['id'],
      },
    },
    {
      name: 'search_posts',
      description: 'Search blog posts by keyword across title, content, and excerpt',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword' },
          status: {
            type: 'string',
            enum: ['draft', 'published', 'all'],
            description: 'Filter by status (default: all)',
          },
        },
        required: ['query'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const user = getUser();

  if (!user) {
    return {
      content: [{ type: 'text', text: 'Error: No user found in the database. Register a user on the blog first.' }],
      isError: true,
    };
  }

  try {
    switch (name) {
      case 'list_posts': {
        const status = args?.status || 'all';
        const limit = args?.limit || 20;
        let query = 'SELECT id, title, excerpt, status, created_at, updated_at FROM posts WHERE user_id = ?';
        const params = [user.id];
        if (status !== 'all') {
          query += ' AND status = ?';
          params.push(status);
        }
        query += ' ORDER BY updated_at DESC LIMIT ?';
        params.push(limit);
        const posts = db.prepare(query).all(...params);
        return {
          content: [{
            type: 'text',
            text: posts.length === 0
              ? 'No posts found.'
              : JSON.stringify(posts, null, 2),
          }],
        };
      }

      case 'get_post': {
        const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(args.id, user.id);
        if (!post) {
          return { content: [{ type: 'text', text: `Post ${args.id} not found.` }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify(post, null, 2) }] };
      }

      case 'create_post': {
        const stmt = db.prepare(
          'INSERT INTO posts (user_id, title, content, excerpt, featured_image, status) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const result = stmt.run(
          user.id,
          args.title,
          args.content,
          args.excerpt || null,
          args.featured_image || null,
          args.status || 'draft'
        );
        return {
          content: [{
            type: 'text',
            text: `Post created successfully.\nID: ${result.lastInsertRowid}\nTitle: ${args.title}\nStatus: ${args.status || 'draft'}`,
          }],
        };
      }

      case 'update_post': {
        const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(args.id, user.id);
        if (!post) {
          return { content: [{ type: 'text', text: `Post ${args.id} not found.` }], isError: true };
        }
        const updated = {
          title: args.title ?? post.title,
          content: args.content ?? post.content,
          excerpt: args.excerpt !== undefined ? args.excerpt : post.excerpt,
          featured_image: args.featured_image !== undefined ? args.featured_image : post.featured_image,
          status: args.status ?? post.status,
        };
        db.prepare(
          'UPDATE posts SET title = ?, content = ?, excerpt = ?, featured_image = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
        ).run(updated.title, updated.content, updated.excerpt, updated.featured_image, updated.status, args.id, user.id);
        return { content: [{ type: 'text', text: `Post ${args.id} updated successfully.` }] };
      }

      case 'publish_post': {
        const result = db.prepare(
          'UPDATE posts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
        ).run('published', args.id, user.id);
        if (result.changes === 0) {
          return { content: [{ type: 'text', text: `Post ${args.id} not found.` }], isError: true };
        }
        return { content: [{ type: 'text', text: `Post ${args.id} is now published.` }] };
      }

      case 'unpublish_post': {
        const result = db.prepare(
          'UPDATE posts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
        ).run('draft', args.id, user.id);
        if (result.changes === 0) {
          return { content: [{ type: 'text', text: `Post ${args.id} not found.` }], isError: true };
        }
        return { content: [{ type: 'text', text: `Post ${args.id} reverted to draft.` }] };
      }

      case 'delete_post': {
        const result = db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(args.id, user.id);
        if (result.changes === 0) {
          return { content: [{ type: 'text', text: `Post ${args.id} not found.` }], isError: true };
        }
        return { content: [{ type: 'text', text: `Post ${args.id} deleted.` }] };
      }

      case 'search_posts': {
        const q = `%${args.query}%`;
        const status = args?.status || 'all';
        let query = 'SELECT id, title, excerpt, status, created_at FROM posts WHERE user_id = ? AND (title LIKE ? OR content LIKE ? OR excerpt LIKE ?)';
        const params = [user.id, q, q, q];
        if (status !== 'all') {
          query += ' AND status = ?';
          params.push(status);
        }
        query += ' ORDER BY updated_at DESC LIMIT 20';
        const posts = db.prepare(query).all(...params);
        return {
          content: [{
            type: 'text',
            text: posts.length === 0
              ? `No posts matching "${args.query}".`
              : JSON.stringify(posts, null, 2),
          }],
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
