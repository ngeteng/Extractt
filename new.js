// kumpulSaldo_v4_from_txt.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// --- KONFIGURASI PENTING ---
const ALAMAT_PENERIMA = process.env.ALAMAT_PENERIMA; // Alamat wallet utama
const JUMLAH_PROSES_PARALEL = 2; // Berapa banyak transaksi yang dikirim bersamaan

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
const inputFile = path.join(__dirname, 'wallet.txt'); // <-- UBAH: Membaca dari wallet.txt
const successFile = path.join(__dirname, 'BERHASIL.json');
const failedFile = path.join(__dirname, 'GAGAL.json');

// --- FUNGSI PEMBANTU ---
// Fungsi untuk membagi array menjadi potongan-potongan kecil (chunks)
function chunkArray(array, size) {
    const chunkedArr = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
}

// Fungsi untuk memproses satu wallet dari private key
async function processWallet(privateKey) {
    // Pastikan private key memiliki prefix '0x'
    const pk = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
    const wallet = new ethers.Wallet(pk, provider);
    
    try {
        // 1. Dapatkan saldo terbaru langsung dari blockchain
        const balanceWei = await provider.getBalance(wallet.address);

        // 2. Lewati jika saldo 0 untuk efisiensi
        if (balanceWei === 0n) { // Menggunakan BigInt 0n
            return {
                status: 'skipped',
                address: wallet.address,
                reason: 'Saldo 0'
            };
        }

        const { maxFeePerGas, maxPriorityFeePerGas } = (await provider.getFeeData());
        
        if (!maxFeePerGas || !maxPriorityFeePerGas) {
            throw new Error("RPC tidak mendukung EIP-1559.");
        }

        const gasLimit = BigInt(21000);
        const estimatedFee = maxFeePerGas * gasLimit;

        if (balanceWei <= estimatedFee) {
            throw new Error(`Saldo tidak cukup untuk gas. Saldo: ${ethers.formatEther(balanceWei)}, Estimasi Biaya: ${ethers.formatEther(estimatedFee)}`);
        }

        const valueToSend = balanceWei - estimatedFee;
        const tx = {
            to: ALAMAT_PENERIMA,
            value: valueToSend,
            gasLimit: gasLimit,
            maxFeePerGas: maxFeePerGas,
            maxPriorityFeePerGas: maxPriorityFeePerGas,
            type: 2,
        };

        const txResponse = await wallet.sendTransaction(tx);
        return {
            status: 'success',
            address: wallet.address,
            hash: txResponse.hash,
            sentAmount: ethers.formatEther(valueToSend)
        };
    } catch (error) {
        return {
            status: 'failed',
            address: wallet.address,
            reason: error.message || 'Unknown error'
        };
    }
}

// --- FUNGSI UTAMA ---
async function sweepWalletsV4() {
    if (!fs.existsSync(inputFile)) {
        console.error(`File ${inputFile} tidak ditemukan! Buat file wallet.txt terlebih dahulu.`);
        return;
    }

    // <-- UBAH: Logika membaca file .txt
    const fileContent = fs.readFileSync(inputFile, 'utf-8');
    const privateKeys = fileContent.split('\n').map(pk => pk.trim()).filter(Boolean); // Membaca per baris, membersihkan spasi, dan menghapus baris kosong

    if (privateKeys.length === 0) {
        console.log("File wallet.txt kosong. Tidak ada yang diproses.");
        return;
    }

    console.log(`🚀 Memulai proses pengumpulan V4 untuk ${privateKeys.length} wallet dari wallet.txt...`);
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

    // --- Simpan Hasil ke File & Tampilkan Ringkasan ---
    if (successfulSweeps.length > 0) fs.writeFileSync(successFile, JSON.stringify(successfulSweeps, null, 2));
    if (failedSweeps.length > 0) fs.writeFileSync(failedFile, JSON.stringify(failedSweeps, null, 2));

    console.log("\n--- ✨ Ringkasan Proses V4 ✨ ---");
    console.log(`Total Private Key     : ${privateKeys.length}`);
    console.log(`✅ Berhasil Dikirim      : ${successfulSweeps.length} (detail di ${successFile})`);
    console.log(`❌ Gagal                 : ${failedSweeps.length} (detail di ${failedFile})`);
    console.log(`🟡 Dilewati (Saldo 0)  : ${skippedCount}`);
    console.log("\n--- Proses Selesai ---");
}

sweepWalletsV4().catch(error => {
    console.error("\nTerjadi kesalahan fatal selama proses:", error);
});
