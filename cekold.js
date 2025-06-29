// cekTokenLama.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// --- KONFIGURASI ---
const rpcUrl = process.env.RPC_URL; // Pastikan ini RPC untuk Ethereum Mainnet
if (!rpcUrl) {
    console.error("⛔ Kesalahan: RPC_URL tidak ditemukan di file .env.");
    process.exit(1);
}
const provider = new ethers.JsonRpcProvider(rpcUrl);

// Konfigurasi token lama yang ingin dicek
const TOKEN_TO_CHECK = {
    name: "Old TRON (TRX ERC20)",
    address: "0xf230b790e05390fc8295f4d3f60332c93bed42e2",
    decimals: 6
};

// ABI minimal untuk fungsi balanceOf ERC20
const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256)"
];

// Path ke file private keys
const keysFilePath = path.join(__dirname, 'HASIL_PRIVATE_KEYS_REGEX.txt');

// --- FUNGSI UTAMA ---
async function checkOldTokenBalance() {
    console.log(`🔎 Memeriksa saldo untuk token: ${TOKEN_TO_CHECK.name}`);

    // Membuat instance kontrak token
    const tokenContract = new ethers.Contract(TOKEN_TO_CHECK.address, erc20Abi, provider);

    const privateKeys = fs.readFileSync(keysFilePath, 'utf-8').split(/\r?\n/).filter(key => key.trim() !== '');
    console.log(`Membaca ${privateKeys.length} private key untuk dicek...\n`);

    let totalTokenFound = 0;
    const walletsWithToken = [];

    for (const privateKey of privateKeys) {
        try {
            const wallet = new ethers.Wallet(privateKey);
            const address = wallet.address;

            // Memanggil fungsi balanceOf dari kontrak token
            const balanceWei = await tokenContract.balanceOf(address);

            if (balanceWei > 0) {
                // Konversi saldo menggunakan desimal token yang benar
                const balanceFormatted = ethers.formatUnits(balanceWei, TOKEN_TO_CHECK.decimals);
                console.log(`✅ DITEMUKAN! Alamat ${address} memiliki ${balanceFormatted} ${TOKEN_TO_CHECK.name}`);
                
                walletsWithToken.push({
                    address: address,
                    balance: balanceFormatted
                });
                totalTokenFound += parseFloat(balanceFormatted);
            }
        } catch (error) {
            // Abaikan error untuk private key yang mungkin tidak valid
        }
    }

    console.log("\n--- ✨ Ringkasan Pengecekan Token Lama ✨ ---");
    if (walletsWithToken.length > 0) {
        console.log(`Ditemukan ${walletsWithToken.length} wallet yang masih menyimpan ${TOKEN_TO_CHECK.name}.`);
        console.log(`Total token ditemukan di semua wallet: ${totalTokenFound} ${TOKEN_TO_CHECK.name}`);
        fs.writeFileSync('TOKEN_LAMA_DITEMUKAN.json', JSON.stringify(walletsWithToken, null, 2));
        console.log("Detailnya disimpan di file: TOKEN_LAMA_DITEMUKAN.json");
    } else {
        console.log(`Tidak ada saldo ${TOKEN_TO_CHECK.name} yang ditemukan di semua wallet yang dicek.`);
    }
}

checkOldTokenBalance().catch(console.error);
