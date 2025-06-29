// kumpulSaldo.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// --- KONFIGURASI PENTING ---
// !!! GANTI DENGAN ALAMAT UTAMA KAMU UNTUK MENERIMA SEMUA SALDO !!!
const ALAMAT_PENERIMA = "0x4375d555ede2a6f1892104a5a953fa9c2ea18bf8";

// --- VALIDASI & INISIALISASI ---
if (ALAMAT_PENERIMA === "0xALAMATUTAMAKAMU" || !ethers.isAddress(ALAMAT_PENERIMA)) {
    console.error("⛔ Berhenti! Ganti 'ALAMAT_PENERIMA' dengan alamat wallet utamamu yang valid di dalam file kumpulSaldo.js");
    process.exit(1);
}
const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) {
    console.error("⛔ Kesalahan: RPC_URL tidak ditemukan di file .env.");
    process.exit(1);
}
const provider = new ethers.JsonRpcProvider(rpcUrl);
const inputFile = path.join(__dirname, 'SALDO_DITEMUKAN.json');

// --- FUNGSI UTAMA ---
async function sweepWallets() {
    console.log(`Membaca daftar wallet dari ${inputFile}...`);
    if (!fs.existsSync(inputFile)) {
        console.error(`File ${inputFile} tidak ditemukan! Jalankan cekSaldo.js terlebih dahulu.`);
        return;
    }

    const walletsToSweep = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
    if (walletsToSweep.length === 0) {
        console.log("Tidak ada wallet dengan saldo untuk dikumpulkan.");
        return;
    }

    console.log(`Tujuan Pengumpulan: ${ALAMAT_PENERIMA}`);
    console.log(`Ditemukan ${walletsToSweep.length} wallet. Memulai proses pengumpulan...\n`);

    for (const walletData of walletsToSweep) {
        const wallet = new ethers.Wallet(walletData.privateKey, provider);
        console.log(`--- Memproses Wallet: ${wallet.address} ---`);

        try {
            const balanceWei = BigInt(walletData.balanceWei);
            const feeData = await provider.getFeeData();
            // Kita gunakan gasPrice dari provider untuk mendapatkan harga pasar saat ini
            const gasPrice = feeData.gasPrice;
            const gasLimit = BigInt(21000); // Gas limit standar untuk transfer ETH
            const estimatedFee = gasPrice * gasLimit;

            console.log(`Saldo: ${ethers.formatEther(balanceWei)} ETH`);
            console.log(`Estimasi Biaya Gas: ${ethers.formatEther(estimatedFee)} ETH`);

            // Cek paling penting: apakah saldo cukup untuk bayar gas?
            if (balanceWei <= estimatedFee) {
                console.log("❌ Saldo tidak cukup untuk membayar biaya gas. Melewati wallet ini.\n");
                continue;
            }

            // Kirim saldo setelah dikurangi biaya gas
            const valueToSend = balanceWei - estimatedFee;
            console.log(`Jumlah yang akan dikirim: ${ethers.formatEther(valueToSend)} ETH`);

            const tx = {
                to: ALAMAT_PENERIMA,
                value: valueToSend,
                gasPrice: gasPrice,
                gasLimit: gasLimit,
            };

            const txResponse = await wallet.sendTransaction(tx);
            console.log(`✅ Transaksi Terkirim! Cek di Etherscan: https://etherscan.io/tx/${txResponse.hash}`);
            console.log("Menunggu konfirmasi...");
            
            await txResponse.wait(1); // Menunggu 1 konfirmasi
            console.log("✅ Transaksi Sukses & Terkonfirmasi!\n");

        } catch (error) {
            console.error(`❌ Gagal memproses wallet ${wallet.address}:`, error.message, "\n");
        }
    }
    console.log("--- Proses Pengumpulan Selesai ---");
}

sweepWallets().catch(error => {
    console.error("Terjadi kesalahan fatal selama proses:", error);
});
