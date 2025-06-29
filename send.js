// kumpulSaldo_v2.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// --- KONFIGURASI PENTING ---
const ALAMAT_PENERIMA = process.env.ALAMAT_PENERIMA; // GANTI DENGAN ALAMAT WALLET UTAMAMU

// --- VALIDASI & INISIALISASI ---
if (ALAMAT_PENERIMA === "0xALAMATUTAMAKAMU" || !ethers.isAddress(ALAMAT_PENERIMA)) {
    console.error("⛔ Berhenti! Ganti 'ALAMAT_PENERIMA' dengan alamat wallet utamamu yang valid.");
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
async function sweepWalletsV2() {
    if (!fs.existsSync(inputFile)) {
        console.error(`File ${inputFile} tidak ditemukan! Jalankan cekSaldo.js terlebih dahulu.`);
        return;
    }

    const walletsToSweep = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
    console.log(`🚀 Memulai proses pengumpulan cepat untuk ${walletsToSweep.length} wallet...`);
    console.log(`Tujuan Pengumpulan: ${ALAMAT_PENERIMA}\n`);

    // Counter untuk ringkasan hasil
    let successCount = 0;
    let insufficientFundsCount = 0;
    let otherErrorCount = 0;

    for (const [index, walletData] of walletsToSweep.entries()) {
        const wallet = new ethers.Wallet(walletData.privateKey, provider);
        process.stdout.write(`[${index + 1}/${walletsToSweep.length}] Memproses ${wallet.address}... `);

        try {
            const balanceWei = BigInt(walletData.balanceWei);
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice;
            const gasLimit = BigInt(21000);
            const estimatedFee = gasPrice * gasLimit;

            // Cek saldo vs biaya gas
            if (balanceWei <= estimatedFee) {
                console.log("-> ❌ Gagal: Saldo tidak cukup untuk bayar gas.");
                insufficientFundsCount++;
                continue; // Lanjut ke wallet berikutnya
            }

            const valueToSend = balanceWei - estimatedFee;
            const tx = {
                to: ALAMAT_PENERIMA,
                value: valueToSend,
                gasPrice: gasPrice,
                gasLimit: gasLimit,
            };

            const txResponse = await wallet.sendTransaction(tx);
            console.log(`-> ✅ Terkirim! Hash: ${txResponse.hash.slice(0, 12)}...`);
            successCount++;

            // TIDAK ADA "await txResponse.wait()" LAGI, LANGSUNG LANJUT!

        } catch (error) {
            // Log error yang lebih ramah
            if (error.code === 'INSUFFICIENT_FUNDS') {
                console.log("-> ❌ Gagal: Saldo tidak cukup (error pra-kirim).");
                insufficientFundsCount++;
            } else {
                console.log(`-> 🚨 Gagal: Terjadi error lain (${error.code || 'UNKNOWN'}).`);
                otherErrorCount++;
            }
        }
    }

    // --- Tampilkan Ringkasan Hasil ---
    console.log("\n--- ✨ Ringkasan Proses ✨ ---");
    console.log(`Total Wallet Diproses : ${walletsToSweep.length}`);
    console.log(`✅ Berhasil Dikirim      : ${successCount}`);
    console.log(`❌ Gagal (Saldo Kurang) : ${insufficientFundsCount}`);
    console.log(`🚨 Gagal (Error Lain)   : ${otherErrorCount}`);
    console.log("\nCatatan: 'Berhasil Dikirim' berarti transaksi sudah masuk ke jaringan,");
    console.log("bukan berarti sudah pasti terkonfirmasi di blockchain.");
    console.log("--- Proses Selesai ---");
}

sweepWalletsV2().catch(error => {
    console.error("\nTerjadi kesalahan fatal selama proses:", error);
});
