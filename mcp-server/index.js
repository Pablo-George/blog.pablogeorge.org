#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const BLOG_URL = (process.env.BLOG_URL || 'http://localhost:3001').replace(/\/$/, '');
const BLOG_USERNAME = process.env.BLOG_USERNAME;
const BLOG_PASSWORD = process.env.BLOG_PASSWORD;

let sessionCookie = null;

async function login() {
  const resp = await fetch(`${BLOG_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: BLOG_USERNAME, password: BLOG_PASSWORD }),
    redirect: 'manual',
  });
  const cookie = resp.headers.get('set-cookie');
  if (!cookie) throw new Error('Login failed — check BLOG_USERNAME and BLOG_PASSWORD');
  sessionCookie = cookie.split(';')[0];
}

async function api(path, { method = 'GET', body } = {}) {
  if (!sessionCookie) await login();

  const opts = {
    method,
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  let resp = await fetch(`${BLOG_URL}/api${path}`, opts);

  if (resp.status === 401) {
    await login();
    resp = await fetch(`${BLOG_URL}/api${path}`, { ...opts, headers: { ...opts.headers, Cookie: sessionCookie } });
  }

  const text = await resp.text();
  try { return { ok: resp.ok, status: resp.status, data: JSON.parse(text) }; }
  catch { return { ok: resp.ok, status: resp.status, data: { error: text } }; }
}

const server = new Server(
  { name: 'blog-mcp', version: '2.0.0' },
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
          status: { type: 'string', enum: ['draft', 'published', 'all'], description: 'Filter by status (default: all)' },
          limit: { type: 'number', description: 'Max posts to return (default: 20)' },
        },
      },
    },
    {
      name: 'get_post',
      description: 'Get a single blog post by ID, including full content',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number', description: 'Post ID' } },
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
          status: { type: 'string', enum: ['draft', 'published'], description: 'Post status (default: draft)' },
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
          status: { type: 'string', enum: ['draft', 'published'], description: 'New status' },
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
        properties: { id: { type: 'number', description: 'Post ID' } },
        required: ['id'],
      },
    },
    {
      name: 'unpublish_post',
      description: 'Revert a published post back to draft',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number', description: 'Post ID' } },
        required: ['id'],
      },
    },
    {
      name: 'delete_post',
      description: 'Permanently delete a blog post',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number', description: 'Post ID' } },
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
          status: { type: 'string', enum: ['draft', 'published', 'all'], description: 'Filter by status (default: all)' },
        },
        required: ['query'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const err = (msg) => ({ content: [{ type: 'text', text: `Error: ${msg}` }], isError: true });
  const ok = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });

  try {
    switch (name) {
      case 'list_posts': {
        const params = new URLSearchParams();
        if (args?.status) params.set('status', args.status);
        if (args?.limit) params.set('limit', args.limit);
        const { ok: success, data } = await api(`/posts?${params}`);
        if (!success) return err(data.error);
        return ok(data.length === 0 ? 'No posts found.' : data);
      }

      case 'get_post': {
        const { ok: success, data } = await api(`/posts/${args.id}`);
        if (!success) return err(data.error);
        return ok(data);
      }

      case 'create_post': {
        const { ok: success, data } = await api('/posts', {
          method: 'POST',
          body: {
            title: args.title,
            content: args.content,
            excerpt: args.excerpt || '',
            status: args.status || 'draft',
            featured_image: args.featured_image || '',
          },
        });
        if (!success) return err(data.error);
        return ok(`Post created.\nID: ${data.id}\nTitle: ${args.title}\nStatus: ${data.status}`);
      }

      case 'update_post': {
        const { ok: success, data } = await api(`/posts/${args.id}`, {
          method: 'PUT',
          body: {
            ...(args.title !== undefined && { title: args.title }),
            ...(args.content !== undefined && { content: args.content }),
            ...(args.excerpt !== undefined && { excerpt: args.excerpt }),
            ...(args.status !== undefined && { status: args.status }),
            ...(args.featured_image !== undefined && { featured_image: args.featured_image }),
          },
        });
        if (!success) return err(data.error);
        return ok(`Post ${args.id} updated.`);
      }

      case 'publish_post': {
        const { ok: success, data } = await api(`/posts/${args.id}`, { method: 'PUT', body: { status: 'published' } });
        if (!success) return err(data.error);
        return ok(`Post ${args.id} is now published.`);
      }

      case 'unpublish_post': {
        const { ok: success, data } = await api(`/posts/${args.id}`, { method: 'PUT', body: { status: 'draft' } });
        if (!success) return err(data.error);
        return ok(`Post ${args.id} reverted to draft.`);
      }

      case 'delete_post': {
        const { ok: success, data } = await api(`/posts/${args.id}`, { method: 'DELETE' });
        if (!success) return err(data.error);
        return ok(`Post ${args.id} deleted.`);
      }

      case 'search_posts': {
        const params = new URLSearchParams({ q: args.query });
        if (args?.status) params.set('status', args.status);
        const { ok: success, data } = await api(`/search?${params}`);
        if (!success) return err(data.error);
        return ok(data.length === 0 ? `No posts matching "${args.query}".` : data);
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err(e.message);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
