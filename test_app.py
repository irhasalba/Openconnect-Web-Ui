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

    def test_duplicate_url_rejected(self):
        self.client.post('/api/portals', json={
            'name': 'First',
            'url': 'vpn.example.com'
        })
        res = self.client.post('/api/portals', json={
            'name': 'Second',
            'url': 'https://vpn.example.com/'
        })
        data = json.loads(res.data)
        self.assertFalse(data['success'])
        self.assertEqual(res.status_code, 409)

    def test_missing_portal_returns_error(self):
        res = self.client.put('/api/portals/9999', json={
            'name': 'X',
            'url': 'x.example.com'
        })
        self.assertEqual(res.status_code, 404)
        self.assertFalse(json.loads(res.data)['success'])

        res2 = self.client.delete('/api/portals/9999')
        self.assertEqual(res2.status_code, 404)
        self.assertFalse(json.loads(res2.data)['success'])

    def test_blank_url_rejected(self):
        res = self.client.post('/api/portals', json={'name': 'Blank', 'url': '   '})
        data = json.loads(res.data)
        self.assertFalse(data['success'])
        self.assertEqual(res.status_code, 400)

    def test_name_defaults_to_url(self):
        res = self.client.post('/api/portals', json={'url': 'vpn.example.com'})
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        self.assertEqual(data['portal']['name'], 'vpn.example.com')

if __name__ == '__main__':
    unittest.main()
