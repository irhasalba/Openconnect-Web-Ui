# GP Connect - GlobalProtect VPN Client

Web UI untuk **GlobalProtect VPN**, menggunakan `gpclient` (dari [yuezk/GlobalProtect-openconnect](https://github.com/yuezk/GlobalProtect-openconnect)) sebagai backend.

## Fitur

✅ **Simple**: Hanya input URL portal (contoh: `sasa.telkomsel.co.id`)  
✅ **SAML/SSO Support**: Otomatis membuka browser untuk login SSO  
✅ **Auto Gateway**: Memilih gateway secara otomatis  
✅ **Session Caching**: Menyimpan login session untuk koneksi berikutnya  
✅ **Real-time Logs**: Monitoring koneksi langsung dari browser  

## Requirements

Aplikasi ini memerlukan:
- **gpclient** (sudah terinstall: `/usr/bin/gpclient`)
- **openconnect** (sudah terinstall: `/usr/sbin/openconnect`)
- **Flask** (Python web framework)
- **Passwordless sudo** untuk gpclient

## Setup (Satu kali saja)

### 1. Install Dependencies

```bash
cd ~/gp_connect
./setup.sh
```

Atau manual:
```bash
pip install -r requirements.txt
```

### 2. Configure Passwordless Sudo

**PENTING**: Agar aplikasi bisa memulai VPN tanpa prompt password, jalankan:

```bash
echo '%sudo ALL=(ALL) NOPASSWD: /usr/sbin/openconnect, /usr/bin/gpclient, /usr/bin/gpauth' | sudo tee /etc/sudoers.d/globalprotect-openconnect
sudo chmod 0440 /etc/sudoers.d/globalprotect-openconnect
```

Verifikasi:
```bash
sudo -n gpclient --version
```

Jika tidak ada error, setup berhasil!

## Cara Menggunakan

### 1. Jalankan Server

```bash
cd ~/gp_connect
./run.sh
```

Atau manual:
```bash
python3 app.py
```

### 2. Buka Browser

Akses: **http://localhost:5000**

### 3. Connect ke VPN

1. Klik tombol **"Connect VPN"**
2. Masukkan portal address: `sasa.telkomsel.co.id`
3. Klik **"Connect"**

**Untuk portal SAML/SSO** (seperti `sasa.telkomsel.co.id`):
- Browser akan otomatis terbuka
- Login dengan kredensial SSO kamu
- Setelah berhasil, tutup browser dan kembali ke aplikasi
- VPN akan terkoneksi otomatis

**Untuk portal Username/Password**:
- Masukkan username dan password saat diminta

### 4. Disconnect

Klik tombol **"Disconnect"** di halaman utama.

## Troubleshooting

### Error: "sudo requires password"

Setup passwordless sudo belum dikonfigurasi. Jalankan:
```bash
./setup.sh
```

### Error: "gpclient not found"

Install GlobalProtect-openconnect:
```bash
# Untuk Debian/Ubuntu:
sudo apt install globalprotect-openconnect

# Atau download dari:
# https://github.com/yuezk/GlobalProtect-openconnect/releases
```

### Browser tidak terbuka untuk SAML login

1. Pastikan kamu menjalankan aplikasi di desktop (bukan server remote)
2. Browser default sistem harus sudah dikonfigurasi
3. Coba jalankan manual dari terminal:
   ```bash
   sudo gpclient connect sasa.telkomsel.co.id --browser
   ```

### VPN connect tapi tidak bisa browsing

Periksa routing dan DNS:
```bash
ip route
cat /etc/resolv.conf
```

## Portal yang Sudah Ditest

✅ **sasa.telkomsel.co.id** (SAML/SSO)  
✅ Portal dengan username/password  

## Struktur Folder

```
gp_connect/
├── app.py              # Backend Flask
├── templates/
│   └── index.html      # UI utama
├── static/
│   ├── css/style.css   # Styling
│   └── js/app.js       # Frontend logic
├── requirements.txt    # Python dependencies
├── setup.sh           # Setup script
├── run.sh             # Launch script
└── README.md          # File ini
```

## Technical Details

- **Backend**: Flask + `gpclient` via PTY (pseudo-terminal)
- **Frontend**: Vanilla JavaScript + modern CSS
- **VPN Protocol**: GlobalProtect (Palo Alto Networks)
- **OpenConnect Version**: v9.12-3.3

## Credits

- [yuezk/GlobalProtect-openconnect](https://github.com/yuezk/GlobalProtect-openconnect) - gpclient backend
- [OpenConnect](https://www.infradead.org/openconnect/) - VPN client library

## License

MIT License - Feel free to use and modify!

---

**Note**: Aplikasi ini adalah web wrapper untuk `gpclient`. Semua kredensial dan session disimpan oleh `gpclient` di cache lokal, tidak dikirim ke server manapun.
