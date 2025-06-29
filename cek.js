// Memuat variabel dari file .env
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// --- KONFIGURASI ---
// Mengambil URL RPC dari file .env
const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) {
    console.error("Kesalahan: RPC_URL tidak ditemukan. Pastikan file .env sudah benar.");
    process.exit(1); // Keluar dari skrip jika tidak ada RPC
}

// Path ke file yang berisi daftar private key
const keysFilePath = path.join(__dirname, 'HASIL_PRIVATE_KEYS_REGEX.txt');
// File output untuk menyimpan hasil
const outputFilePath = path.join(__dirname, 'SALDO_DITEMUKAN.json');


// --- FUNGSI UTAMA ---
async function checkBalances() {
    console.log("Menghubungkan ke blockchain melalui RPC...");
    // Membuat koneksi ke blockchain
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    console.log(`Membaca private keys dari: ${keysFilePath}`);
    const privateKeys = fs.readFileSync(keysFilePath, 'utf-8').split(/\r?\n/).filter(key => key.trim() !== '');

    if (privateKeys.length === 0) {
        console.log("Tidak ada private key untuk dicek.");
        return;
    }

    console.log(`Ditemukan ${privateKeys.length} private key. Memulai pengecekan saldo...`);
    const walletsWithBalance = [];
    let checkedCount = 0;

    for (const privateKey of privateKeys) {
        try {
            // Membuat instance wallet SECARA LOKAL. Private key tidak dikirim.
            const wallet = new ethers.Wallet(privateKey, provider);
            const address = wallet.address;

            // Mengambil saldo dari blockchain menggunakan alamat
            const balanceInWei = await provider.getBalance(address);

            checkedCount++;
            process.stdout.write(`\rMengecek wallet ke-${checkedCount}/${privateKeys.length}... Alamat: ${address}`);

            // Cek jika saldo lebih besar dari 0
            if (balanceInWei > 0) {
                // Konversi saldo dari Wei (unit terkecil) ke Ether
                const balanceInEther = ethers.formatEther(balanceInWei);
                
                process.stdout.write('\n'); // Pindah baris baru jika ada saldo
                console.log(`✅ DITEMUKAN! Saldo: ${balanceInEther} ETH di alamat ${address}`);
                
                walletsWithBalance.push({
                    address: address,
                    privateKey: privateKey, // Simpan juga private key untuk kemudahan
                    balance: balanceInEther,
                    balanceWei: balanceInWei.toString()
                });
            }
        } catch (error) {
            // Menangani jika ada private key yang formatnya salah
            console.warn(`\n⚠️ Gagal memproses salah satu private key. Mungkin formatnya tidak valid.`);
        }
    }

    console.log("\n\n--- Pengecekan Selesai ---");

    if (walletsWithBalance.length > 0) {
        console.log(`🎉 Selamat! Ditemukan ${walletsWithBalance.length} wallet dengan saldo.`);
        // Menyimpan hasil ke file JSON untuk data yang lebih terstruktur
        fs.writeFileSync(outputFilePath, JSON.stringify(walletsWithBalance, null, 2));
        console.log(`Detailnya disimpan di file: ${outputFilePath}`);
    } else {
        console.log("Sayang sekali, tidak ada saldo yang ditemukan di semua wallet yang dicek.");
    }
}

// Jalankan fungsi utama dan tangani jika ada error
checkBalances().catch(error => {
    console.error("\nTerjadi kesalahan fatal:", error);
});
