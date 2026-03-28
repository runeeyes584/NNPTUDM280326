var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require('../utils/uploadHandler')
let exceljs = require('exceljs')
let path = require('path')
let categoriesModel = require('../schemas/categories')
let productModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let userModel = require('../schemas/users')
let roleModel = require('../schemas/roles')
let mongoose = require('mongoose');
let slugify = require('slugify')
let crypto = require('crypto')
let { sendGeneratedPasswordMail } = require('../utils/mailHandler')
//client ->upload->save

router.post('/one_file', uploadImage.single('file'), function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
    } else {
        res.send({
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size
        })
    }
})
router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(__dirname, '../uploads', req.params.filename)
    res.sendFile(pathFile)
})

router.post('/multiple_files', uploadImage.array('files'), function (req, res, next) {
    if (!req.files) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
    } else {
        res.send(req.files.map(f => {
            return {
                filename: f.filename,
                path: f.path,
                size: f.size
            }
        }))
    }
})


router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
    } else {
        //workbook->worksheet->row/column->cell
        let workbook = new exceljs.Workbook();
        let pathFile = path.join(__dirname, '../uploads', req.file.filename)
        await workbook.xlsx.readFile(pathFile)
        let worksheet = workbook.worksheets[0];
        let categories = await categoriesModel.find({});
        let categoriesMap = new Map();
        for (const category of categories) {
            categoriesMap.set(category.name, category._id)
        }
        let products = await productModel.find({});
        let getTitle = products.map(p => p.title)
        let getSku = products.map(p => p.sku)
        //Map key->value
        let result = []
        for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
            let errorsInRow = [];
            const row = worksheet.getRow(rowIndex);
            let sku = row.getCell(1).value
            let title = row.getCell(2).value
            let category = row.getCell(3).value
            let price = Number.parseInt(row.getCell(4).value)
            let stock = Number.parseInt(row.getCell(5).value)
            if (price < 0 || isNaN(price)) {
                errorsInRow.push("price la so duong")
            }
            if (stock < 0 || isNaN(stock)) {
                errorsInRow.push("stock la so duong")
            }
            if (!categoriesMap.has(category)) {
                errorsInRow.push("category khong hop le")
            }
            if (getTitle.includes(title)) {
                errorsInRow.push("title khong duoc trung")
            }
            if (getSku.includes(sku)) {
                errorsInRow.push("sku khong duoc trung")
            }
            if (errorsInRow.length > 0) {
                result.push(errorsInRow);
                continue
            }
            let session = await mongoose.startSession()
            session.startTransaction()
            try {
                let newProduct = new productModel({
                    sku: sku,
                    title: title,
                    slug: slugify(title, {
                        replacement: '-',
                        remove: undefined,
                        lower: true
                    }),
                    price: price,
                    description: title,
                    category: categoriesMap.get(category)
                })
                await newProduct.save({ session })
                let newInventory = new inventoryModel({
                    product: newProduct._id,
                    stock: stock
                })
                await newInventory.save({ session });
                await newInventory.populate('product')
                await session.commitTransaction();
                await session.endSession()
                getTitle.push(title);
                getSku.push(sku)
                result.push(newInventory)
            } catch (error) {
                await session.abortTransaction();
                await session.endSession()
                result.push(error.message)
            }
        }
        res.send(result)
    }
})

function getExcelCellText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
        if (value.text) return String(value.text).trim();
        if (value.result) return String(value.result).trim();
        if (value.richText) {
            return value.richText.map((part) => part.text || "").join("").trim();
        }
    }
    return String(value).trim();
}

function generateRandomPassword(length = 16) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_-+=";
    let password = "";
    while (password.length < length) {
        const randomByte = crypto.randomBytes(1)[0];
        password += chars[randomByte % chars.length];
    }
    return password;
}

router.post('/excel/users-docs', async function (req, res, next) {
    try {
        const workbook = new exceljs.Workbook();
        const filePath = path.join(__dirname, '../docs/user.xlsx');
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.worksheets[0];

        const userRole = await roleModel.findOne({
            isDeleted: false,
            name: { $regex: /^user$/i }
        });

        if (!userRole) {
            return res.status(404).send({
                message: "Khong tim thay role 'user'. Vui long tao role user truoc khi import."
            });
        }

        const existedUsers = await userModel.find(
            { isDeleted: false },
            { username: 1, email: 1 }
        );
        const usedUsernames = new Set(existedUsers.map((u) => u.username));
        const usedEmails = new Set(existedUsers.map((u) => u.email));

        const rowLimit = Number.parseInt(req.query.limit);
        const hasLimit = Number.isInteger(rowLimit) && rowLimit > 0;

        const result = [];
        let importedCount = 0;

        for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
            if (hasLimit && importedCount >= rowLimit) break;

            const row = worksheet.getRow(rowIndex);
            const username = getExcelCellText(row.getCell(1).value);
            const email = getExcelCellText(row.getCell(2).value).toLowerCase();

            if (!username || !email) {
                result.push({ row: rowIndex, status: "skipped", reason: "username/email bi trong" });
                continue;
            }

            if (usedUsernames.has(username)) {
                result.push({ row: rowIndex, username, email, status: "skipped", reason: "username da ton tai" });
                continue;
            }

            if (usedEmails.has(email)) {
                result.push({ row: rowIndex, username, email, status: "skipped", reason: "email da ton tai" });
                continue;
            }

            const rawPassword = generateRandomPassword(16);
            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                const newUser = new userModel({
                    username,
                    email,
                    password: rawPassword,
                    role: userRole._id,
                    status: true
                });

                await newUser.save({ session });
                await sendGeneratedPasswordMail(email, username, rawPassword);

                await session.commitTransaction();
                await session.endSession();

                usedUsernames.add(username);
                usedEmails.add(email);
                importedCount++;
                result.push({ row: rowIndex, username, email, status: "created" });
            } catch (error) {
                await session.abortTransaction();
                await session.endSession();
                result.push({ row: rowIndex, username, email, status: "failed", reason: error.message });
            }
        }

        return res.send({
            message: "Import user tu docs/user.xlsx hoan tat",
            importedCount,
            totalRows: worksheet.rowCount - 1,
            results: result
        });
    } catch (error) {
        return res.status(500).send({
            message: error.message
        });
    }
})

module.exports = router;
