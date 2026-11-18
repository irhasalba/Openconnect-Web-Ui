# Portal CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SQLite database storage and CRUD API/UI for portal lists, including a dropdown selector above the Connect button and a portal management modal.

**Architecture:**
- Backend: SQLite database (`portals.db`) managed via helper functions in `app.py`, with RESTful endpoints (`/api/portals` GET, POST, PUT, DELETE).
- Frontend: Dropdown list of saved portals above the Connect button in `templates/index.html`, a management modal (`Manage Portals`), and updated JavaScript handlers in `static/js/app.js` and styling in `static/css/style.css`.
- Testing: Unit tests in `test_app.py` using Python `unittest` and Flask test client with an isolated test database.

**Tech Stack:** Flask, SQLite3, Vanilla JS, HTML/CSS, Pytest/Unittest.

**Spec:** User request and approved brainstorming design for Portal CRUD.

## Global Constraints
- Database file name: `portals.db` in project root.
- Portal URL normalization: strip `http://` or `https://` prefix and trailing slashes.
- Input validation: Name and URL cannot be empty or whitespace only.
- Parameterized SQL queries for all DB operations to prevent SQL injection.

## Review Focus
1. SQL injection safety: All SQL queries must use parameterized tuples (`?`).
2. Duplicate URLs: If a user adds an existing normalized URL, handle gracefully (update name or return validation message).
3. Missing portal ID in PUT/DELETE: Return appropriate JSON error response (`success: False`) when ID does not exist.
4. Modal usability: ESC key or click outside modal backdrop closes the management modal.
5. Dropdown state syncing: When selecting a portal from the dropdown, the main portal input field updates instantly.

---

### Task 1: Backend SQLite Database & Portal CRUD API

**Files:**
- Modify: `app.py`
- Create: `test_app.py`

**Interfaces:**
- Consumes: None
- Produces:
  - SQLite helpers: `init_db()`, `get_db_connection()`, `normalize_url(url)`.
  - API Routes:
    - `GET /api/portals`
    - `POST /api/portals` (JSON: `{name, url}`)
    - `PUT /api/portals/<int:portal_id>` (JSON: `{name, url}`)
    - `DELETE /api/portals/<int:portal_id>`

- [ ] **Step 1: Write failing tests in `test_app.py` for portal CRUD API**

```python
import os
import unittest
import json
import tempfile

app_module = __import__('app')

class PortalTestCase(unittest.TestCase):
    def setUp(self):
        self.db_fd, app_module.DB_PATH = tempfile.mkstemp()
        app_module.init_db()
        app_module.app.config['TESTING'] = True
        self.client = app_module.app.test_client()

    def tearDown(self):
        os.close(self.db_fd)
        os.unlink(app_module.DB_PATH)

    def test_get_empty_portals(self):
        res = self.client.get('/api/portals')
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        self.assertEqual(data['portals'], [])

    def test_create_and_get_portal(self):
        res = self.client.post('/api/portals', json={
            'name': 'Corporate VPN',
            'url': 'https://vpn.example.com/'
        })
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        self.assertEqual(data['portal']['url'], 'vpn.example.com')
        self.assertEqual(data['portal']['name'], 'Corporate VPN')

        res2 = self.client.get('/api/portals')
        data2 = json.loads(res2.data)
        self.assertEqual(len(data2['portals']), 1)
        self.assertEqual(data2['portals'][0]['url'], 'vpn.example.com')

    def test_update_portal(self):
        res = self.client.post('/api/portals', json={
            'name': 'Old Name',
            'url': 'vpn.example.com'
        })
        portal_id = json.loads(res.data)['portal']['id']

        res2 = self.client.put(f'/api/portals/{portal_id}', json={
            'name': 'New Name',
            'url': 'vpn.example.com'
        })
        data2 = json.loads(res2.data)
        self.assertTrue(data2['success'])
        self.assertEqual(data2['portal']['name'], 'New Name')

    def test_delete_portal(self):
        res = self.client.post('/api/portals', json={
            'name': 'Delete Me',
            'url': 'del.example.com'
        })
        portal_id = json.loads(res.data)['portal']['id']

        res2 = self.client.delete(f'/api/portals/{portal_id}')
        self.assertTrue(json.loads(res2.data)['success'])

        res3 = self.client.get('/api/portals')
        self.assertEqual(len(json.loads(res3.data)['portals']), 0)

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 test_app.py`
Expected: FAIL or ERROR because routes and database functions are not yet implemented in `app.py`.

- [ ] **Step 3: Implement database helpers and API routes in `app.py`**

Add `DB_PATH`, `init_db()`, `normalize_url(url)`, and routes `/api/portals` (GET, POST), `/api/portals/<id>` (PUT, DELETE) using standard `sqlite3` and Flask request JSON parsing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 test_app.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app.py test_app.py
git commit -m "feat: add SQLite database and CRUD API for portals"
```

---

### Task 2: Frontend UI & Styling for Portal Selector and Management Modal

**Files:**
- Modify: `templates/index.html`
- Modify: `static/css/style.css`
- Modify: `static/js/app.js`

**Interfaces:**
- Consumes: `/api/portals` GET, POST, PUT, DELETE
- Produces: Portal dropdown above Connect button, Manage modal with CRUD operations.

- [ ] **Step 1: Add portal dropdown and management modal HTML to `templates/index.html`**

Insert the portal selector dropdown section directly above the "Connect VPN" / portal form in `view-connect`, and add the modal markup before closing `<body>`.

- [ ] **Step 2: Add CSS rules for portal selector and modal in `static/css/style.css`**

Add styling for `.portal-selector`, `.portal-select-row`, `.modal-overlay`, `.modal`, `.modal-header`, `.modal-body`, `.portal-table` / `.portal-item-list` matching dark theme.

- [ ] **Step 3: Implement frontend JavaScript functions in `static/js/app.js`**

Implement `loadPortals()`, `renderPortalDropdown()`, `openPortalManager()`, `closePortalManager()`, `renderPortalManagerList()`, `editPortal()`, `deletePortal()`, `savePortalFromForm()`, and wire `DOMContentLoaded` to call `loadPortals()`.

- [ ] **Step 4: Verify manual test or test suite**

Run: `python3 test_app.py` and `python3 app.py` (brief check).
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add templates/index.html static/css/style.css static/js/app.js
git commit -m "feat: add portal dropdown and management modal UI"
```
