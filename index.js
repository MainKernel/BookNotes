import bodyParser from "body-parser";
import pg from "pg";
import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai'; // Ensure OPENAI_API_KEY environment variable is set


const app = express();
const port = 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imageDir = path.join(__dirname, "public", "images", "book", "cover");

const db = new pg.Client({
    user: "postgres",
    password: "mysecretpassword",
    database: "postgres",
    host: "localhost",
    port: 5432
});
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));


db.connect();

app.get("/", async (req, res) => {
    let bookShelf = await getBooksFromDatabase();
    res.render("index.ejs", {
        books: bookShelf
    });
});

app.get("/add", (req, res) => {
    res.render("add.ejs");
});

app.post("/add", async (req, res) => {
    let request = req.body;
    let savedImagePath = await findBookOnOpenLibraryByName(request.name);
    await addBook(request, savedImagePath);
    res.redirect("/");
});

app.get("/note/:id", async (req, res) => {
    let bookId = req.params.id;
    let book = await getBookById(bookId);
    let object = book[0];
    res.render("note.ejs", {
        item: object
    });
});
app.post("/delete/:id", async(req, res) => {
    let id = req.params.id;
    await deleteBookById(id);
    res.redirect("/");
});
app.get("/edit/:id", async(req, res) => {
    let bookId = req.params.id;
    let book = await getBookById(bookId);
    let object = book[0];
    res.render("edit.ejs", {
        item: object
    });
});
app.post("/edit/:id", async(req, res) => {
    let id = req.params.id;
    let body = req.body;
    updateById(id, body);
    res.redirect("/");
});
async function updateById(id, book) {
    try {
        await db.query("UPDATE book SET book_name = $1, book_author = $2, read_date = $3, recomendation_score = $4, read_recomendation = $5, book_notes = $6, buy_url = $7, category = $8 WHERE id = $9",
            [book.name, book.author, book.date, book.score, book.recomendation, book.notes, book.url, book.category, id]
        );
    } catch (error) {
        console.log(error);
    }
}
async function deleteBookById(id) {
    await db.query(`DELETE FROM book WHERE id = $1`, [id]);    
}
async function getBookById(bookId) {
    try {
      var result =  await db.query("SELECT * FROM book WHERE id = $1", [bookId]);   
    } catch (error) {
        console.log("Error fetching books");
    }
    return result.rows;
}
async function addBook(book, imagePath) {
    let bookName = book.name;
    let bookAuthor = book.author;
    let readDate = book.date;
    let bookScore = book.score;
    let readRecomendations = book.recomendation;
    let note = book.notes;
    let buyUrl = book.url;
    let category = book.category;


    if (readRecomendations == null || readRecomendations === '') {
        readRecomendations = await bookReadRecomendations(bookName);
    }

    try {
        await db.query("INSERT INTO book(book_name, book_author, read_date, recomendation_score, read_recomendation, book_notes, buy_url, book_image, category) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            [bookName, bookAuthor, readDate, bookScore, readRecomendations, note, buyUrl, imagePath, category]);
    } catch (error) {
        console.log("Error on inserting to database: " + error);
    }
}
async function bookReadRecomendations(bookTitle) {
    const result = await generateText({
        model: openai('gpt-4o-mini'),
        system: 'You expert on books observation',
        prompt: `Write a 5 santances why you recomend ${bookTitle}`,
    });
    return result.text;
}
async function findBookOnOpenLibraryByName(bookName) {
    let param = await normalizeBookNameForSearch(bookName);

    let url = `https://openlibrary.org/search.json?q=${param}`;

    let result = await axios.get(url);
    let isbn = new Array();

    result.data.docs.forEach(book => {
        let bookTitle = book.title;
        let bookIsbn = book.isbn;

        if (bookTitle != null && bookIsbn != null) {
            let currentBookIsbn = book.isbn;

            currentBookIsbn.forEach(e => {
                isbn.push(e);
            });
        }
    });
    return await getCover(isbn);
}
async function normalizeBookNameForSearch(bookName) {
    let param = "";
    let book = bookName.split(" ");
    var index = 0;
    book.forEach(e => {
        if (index < book.length - 1) {
            param += e.toLowerCase() + "+";
            index++;
        } else {
            param += e.toLowerCase();
        }
    });
    return param;
}
async function getCover(isbns) {
    let isFound = 0;
    let savedPath = "";
    for (const element of isbns) {
        if (isFound > 0) {
            break; // Exit loop if an image has been found and downloaded
        } else {
            let url = `https://covers.openlibrary.org/b/isbn/${element}-M.jpg`;
            let image = await getBookCover(url); // Await the result of getBookCover
            if (image != null) {

                savedPath = await downloadImage(image, element); // Await the download to ensure it's complete
                isFound++;
                console.log("Image downloaded: " + element);
            }
        }
    }
    return savedPath;
}
async function downloadImage(url, fileName) {
    let savePath = path.join(imageDir, `${fileName}.jpg`);
    let writer = fs.createWriteStream(savePath);
    let response = await axios({
        method: "get",
        url: url,
        responseType: "stream"
    });;
    response.data.pipe(writer);
    return `images/book/cover/${fileName}.jpg`;
}
async function getBookCover(url) {
    let coverSize = await getFileSize(url);
    if (coverSize > 200) {
        return url;
    } else {
        return null;
    }
}
async function getFileSize(url) {
    try {
        const response = await axios({
            method: "get",
            url: url,
            responseType: "stream"
        });

        let totalSize = 0;

        return new Promise((resolve, reject) => {
            response.data.on("data", chunk => {
                totalSize += chunk.length;
            });

            response.data.on("end", () => {
                resolve(totalSize);
            });

            response.data.on("error", err => {
                reject(err);
            });
        });
    } catch (error) {
        console.error("Error fetching the file:", error);
        return 0; // Return 0 in case of an error
    }
}
async function getBooksFromDatabase() {
    try {
        let result = await db.query("SELECT * FROM book");
        return result.rows;
    } catch (error) {
        console.error("Error fetching books:", error);
    }
}
app.listen(port, () => {
    console.log(`Listening on port: ${port}`);
});