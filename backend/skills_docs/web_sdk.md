# Web SDK

## Description
Frontend authorization and data model access via metagptx/web-sdk. Covers Auth flow, Entity CRUD operations (query/queryAll/get/create/update/delete), and Backend Custom API invocation using client.apiCall.invoke.

## Guide

## Frontend Web SDK Usage
### What Web SDK Does
The Web SDK is used for authorization on the frontend and access to the data model data of the backend API through entities.
You can use the SDK to write frontend code to access the data from the backend module.

### Auth
```ts
import { createClient } from '@metagptx/web-sdk';

// Create client instance (no configuration needed)
const client = createClient();

// Auth Module
const user = await client.auth.me();  // User Authorization. Use `user.data` to access user profile
// Auth is now handled by the app's Firebase login page at `/login`.
// After Firebase sign-in, the frontend exchanges the Firebase ID token for
// the app session token via `POST /api/v1/auth/token/exchange`.
```

### Entity Access and Operation
[CRITICAL]. Use `response.data` to access actual entity data instead of `response` itself.

```ts
// photo_works is the entity name
// Get the logged-in user's list of photo_works. For example, display personal uploaded photo works.
// Also used to obtain public entity data, such as product lists and course lists from user-independent entity which `create_only=false`.
const response = await client.entities.photo_works.query({
  query: { status: 'active' },      // optional, can be {}
  sort: '-created_at',              // optional
  limit: 10,                        // optional
  skip: 0,                          // optional
  fields: ['id', 'title', 'tags'],  // optional
});  // Pay Attention. Use `response.data.items` which is list[dict] to access entities' data
// Should use `await client.entities` but not `await api.client.entities` if `api` from `import { api } from '../lib/api';`

// Get all user's list of photo_works. For example, display all photo works in a photography gallery.
// [CRITICAL] The `queryAll` method must only be used within user-related entities that are marked with the `create_only=true` flag. This constraint is mandatory.
const response = await client.entities.photo_works.queryAll({
  query: { status: 'active' },      // optional, can be {}
  sort: '-created_at',              // optional
  limit: 10,                        // optional
  skip: 0,                          // optional
  fields: ['id', 'title', 'tags'],  // optional
});

// Get one PhotoWork with particular fields
const response = await client.entities.photo_works.get({
  id: '12345',                      // required
  fields: ['id', 'title', 'tags'],  // optional
});
// const photoWork: PhotoWork = response.data;

// Create a photo_works entity
const response = await client.entities.photo_works.create({
  data: {
    title: 'classic photography',
    tags: 'classic, art',
  },
});
// const photoWork: PhotoWork = response.data;

// Update photo_works entity with id
const response = await client.entities.photo_works.update({
  id: '12345',
  data: {
    title: 'natural portrait',
  },
});
// const photoWork: PhotoWork = response.data;

// Delete photo_works entity with id
await client.entities.photo_works.delete({ id: '12345' });
```

### Backend Custom API Integration
// use `client.apiCall.invoke` to integrate backend apis
```ts
// GET request with query parameters
const response = await client.apiCall.invoke({
  url: '/api/v1/payment/custom',    // API endpoint path, MUST starts with /api/v1/
  method: 'GET',
  data: { filter: 'active' },        // Request data (body for POST/PUT/PATCH, query params for GET/DELETE)
});

// POST request with body data
const response = await client.apiCall.invoke({
  url: '/api/v1/payment/create_payment_session', // API endpoint path, MUST starts with /api/v1/
  method: 'POST',
  data: { order_id: 123 },
  options: {                         // Additional axios request options like headers
    headers: { 'X-Custom-Header': 'value' },
  },
});  // Pay Attention. Use `response.data` to access data
// Pay Attention. Use `client.utils.openUrl(response.data.url)` to Redirect to Stripe checkout page
```

