// Impor modul bawaan Node.js
const fs = require('fs');
const path = require('path');

// Tentukan path ke folder yang berisi semua wallet.txt
const walletsDir = path.join(__dirname, 'wallets');

// Tentukan nama file output untuk menyimpan semua private key
const outputFile = path.join(__dirname, 'HASIL_PRIVATE_KEYS_REGEX.txt');

// Array untuk menampung semua private key yang berhasil diekstraksi
const extractedKeys = [];

console.log('🚀 Memulai proses ekstraksi dengan logika REGEX...');

try {
    // Baca semua nama file di dalam direktori 'wallets'
    const files = fs.readdirSync(walletsDir);

    let fileCount = 0;
    // Loop setiap file
    for (const file of files) {
        if (path.extname(file) !== '.txt') continue; // Lanjut jika bukan file .txt

        const filePath = path.join(walletsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split(/\r?\n/);
        fileCount++;

        // Loop setiap baris di dalam file untuk menerapkan aturan
        for (const line of lines) {
            const trimmedLine = line.trim();

            // --- INI LOGIKA UTAMANYA ---
            // Aturan: Jika baris TIDAK KOSONG dan TIDAK DIAWALI '0x'
            if (trimmedLine && !trimmedLine.startsWith('0x')) {
                
                // Kita anggap ini private key.
                // Sekarang bersihkan dari awalan angka (misal: "1. ", "2. ", "10. ")
                // Regex: ^\d+\.\s*
                // ^     = dari awal baris
                // \d+   = satu atau lebih angka
                // \.    = karakter titik literal
                // \s* = nol atau lebih spasi
                const privateKey = trimmedLine.replace(/^\d+\.\s*/, '');
                
                // Pastikan hasilnya tidak kosong setelah dibersihkan
                if (privateKey) {
                    extractedKeys.push(privateKey);
                }
            }
            // Jika baris diawali '0x' atau kosong, otomatis akan diabaikan.
        }
    }

    if (extractedKeys.length > 0) {
        fs.writeFileSync(outputFile, extractedKeys.join('\n'));
        
        console.log(`\n✅ Proses Selesai!`);
        console.log(`- Total file diproses: ${fileCount}`);
        console.log(`- Total private key ditemukan: ${extractedKeys.length}`);
        console.log(`- Hasil disimpan di file: ${outputFile}`);
    } else {
        console.log('\n⚠️ Tidak ada private key yang ditemukan dengan aturan yang diberikan.');
        console.log('Pastikan file wallet-mu berisi baris yang tidak diawali "0x".');
    }

} catch (error) {
    console.error('\n❌ Terjadi kesalahan!', error);
    console.error('Pastikan folder "wallets" ada dan berisi file walletmu.');
}
