// kumpulSaldo_v5_legacy.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// --- KONFIGURASI PENTING ---
const ALAMAT_PENERIMA = process.env.ALAMAT_PENERIMA;
const JUMLAH_PROSES_PARALEL = 2;

// --- VALIDASI & INISIALISASI ---
if (!ALAMAT_PENERIMA || !ethers.isAddress(ALAMAT_PENERIMA)) {
    console.error("⛔ Berhenti! Pastikan ALAMAT_PENERIMA valid di file .env.");
    process.exit(1);
}
const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) {
    console.error("⛔ Kesalahan: RPC_URL tidak ditemukan di file .env.");
    process.exit(1);
}
const provider = new ethers.JsonRpcProvider(rpcUrl);
const inputFile = path.join(__dirname, 'wallet.txt');
const successFile = path.join(__dirname, 'BERHASIL.json');
const failedFile = path.join(__dirname, 'GAGAL.json');

// --- FUNGSI PEMBANTU ---
function chunkArray(array, size) {
    const chunkedArr = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
}

// Fungsi untuk memproses satu wallet dari private key
async function processWallet(privateKey) {
    try {
        // Cek awal format private key
        if (!/^(0x)?[0-9a-fA-F]{64}$/.test(privateKey)) {
            throw new Error("Format private key tidak valid (bukan 64 karakter hex).");
        }
        
        const wallet = new ethers.Wallet(privateKey, provider);
        const balanceWei = await provider.getBalance(wallet.address);

        if (balanceWei === 0n) {
            return { status: 'skipped', address: wallet.address, reason: 'Saldo 0' };
        }

        // --- PERUBAHAN UTAMA: MENGGUNAKAN gasPrice (LEGACY) ---
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice;

        if (!gasPrice) {
            throw new Error("Tidak bisa mendapatkan gasPrice dari RPC.");
        }
        
        const gasLimit = BigInt(21000);
        const estimatedFee = gasPrice * gasLimit;

        if (balanceWei <= estimatedFee) {
            throw new Error(`Saldo tidak cukup untuk gas. Saldo: ${ethers.formatEther(balanceWei)}, Estimasi Biaya: ${ethers.formatEther(estimatedFee)}`);
        }

        const valueToSend = balanceWei - estimatedFee;
        const tx = {
            to: ALAMAT_PENERIMA,
            value: valueToSend,
            gasLimit: gasLimit,
            gasPrice: gasPrice, // Menggunakan gasPrice, bukan maxFeePerGas
            // 'type: 2' dihapus untuk transaksi legacy
        };

        const txResponse = await wallet.sendTransaction(tx);
        return {
            status: 'success',
            address: wallet.address,
            hash: txResponse.hash,
            sentAmount: ethers.formatEther(valueToSend)
        };
    } catch (error) {
        // Jika error terjadi sebelum wallet address bisa didapatkan (misal pk salah)
        const pkPreview = privateKey.slice(0, 4) + '...' + privateKey.slice(-4);
        return {
            status: 'failed',
            address: `PK: ${pkPreview}`, // Tampilkan potongan PK jika address tidak ada
            reason: error.message || 'Unknown error'
        };
    }
}

// --- FUNGSI UTAMA (Sama seperti sebelumnya) ---
async function sweepWalletsV5() {
    if (!fs.existsSync(inputFile)) {
        console.error(`File ${inputFile} tidak ditemukan! Buat file wallet.txt terlebih dahulu.`);
        return;
    }
    const fileContent = fs.readFileSync(inputFile, 'utf-8');
    const privateKeys = fileContent.split('\n').map(pk => pk.trim()).filter(Boolean);

    if (privateKeys.length === 0) {
        console.log("File wallet.txt kosong. Tidak ada yang diproses.");
        return;
    }

    console.log(`🚀 Memulai proses pengumpulan V5 (Legacy) untuk ${privateKeys.length} wallet...`);
    console.log(`🎯 Tujuan Pengumpulan: ${ALAMAT_PENERIMA}`);
    console.log(`⚙️  Proses Paralel: ${JUMLAH_PROSES_PARALEL} wallet per batch\n`);

    const pkChunks = chunkArray(privateKeys, JUMLAH_PROSES_PARALEL);
    const successfulSweeps = [];
    const failedSweeps = [];
    let skippedCount = 0;

    for (let i = 0; i < pkChunks.length; i++) {
        const chunk = pkChunks[i];
        console.log(`--- Memproses Batch ${i + 1}/${pkChunks.length} (${chunk.length} wallet) ---`);

        const promises = chunk.map(pk => processWallet(pk));
        const results = await Promise.allSettled(promises);

        results.forEach(result => {
            if (result.status === 'fulfilled') {
                const data = result.value;
                if (data.status === 'success') {
                    console.log(`✅ ${data.address} -> Berhasil dikirim. Hash: ${data.hash.slice(0,12)}...`);
                    successfulSweeps.push(data);
                } else if (data.status === 'skipped') {
                    console.log(`🟡 ${data.address} -> Dilewati: ${data.reason}`);
                    skippedCount++;
                } else { // status === 'failed'
                    console.log(`❌ ${data.address} -> Gagal: ${data.reason}`);
                    failedSweeps.push(data);
                }
            } else {
                console.log(`🚨 Error Kritis: ${result.reason}`);
                failedSweeps.push({ status: 'failed', reason: result.reason.toString() });
            }
        });
    }

    if (successfulSweeps.length > 0) fs.writeFileSync(successFile, JSON.stringify(successfulSweeps, null, 2));
    if (failedSweeps.length > 0) fs.writeFileSync(failedFile, JSON.stringify(failedSweeps, null, 2));

    console.log("\n--- ✨ Ringkasan Proses V5 ✨ ---");
    console.log(`Total Private Key     : ${privateKeys.length}`);
    console.log(`✅ Berhasil Dikirim      : ${successfulSweeps.length} (detail di ${successFile})`);
    console.log(`❌ Gagal                 : ${failedSweeps.length} (detail di ${failedFile})`);
    console.log(`🟡 Dilewati (Saldo 0)  : ${skippedCount}`);
    console.log("\n--- Proses Selesai ---");
}

sweepWalletsV5().catch(error => {
    console.error("\nTerjadi kesalahan fatal selama proses:", error);
});
