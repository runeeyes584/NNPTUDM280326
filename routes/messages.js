var express = require("express");
var mongoose = require("mongoose");
var router = express.Router();
let messageModel = require("../schemas/messages");
let { CheckLogin } = require("../utils/authHandler");

router.get("/", CheckLogin, async function (req, res) {
  try {
    let currentUserId = req.user._id;
    let lastMessages = await messageModel.aggregate([
      {
        $match: {
          $or: [{ from: currentUserId }, { to: currentUserId }]
        }
      },
      {
        $addFields: {
          conversationUser: {
            $cond: [{ $eq: ["$from", currentUserId] }, "$to", "$from"]
          }
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: "$conversationUser",
          lastMessage: { $first: "$$ROOT" }
        }
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: ["$lastMessage", { conversationUser: "$_id" }]
          }
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);

    lastMessages = await messageModel.populate(lastMessages, [
      { path: "from", select: "_id username fullName avatarUrl" },
      { path: "to", select: "_id username fullName avatarUrl" }
    ]);

    res.send(lastMessages);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.get("/:userID", CheckLogin, async function (req, res) {
  try {
    let currentUserId = req.user._id;
    let otherUserId = req.params.userID;

    if (!mongoose.isValidObjectId(otherUserId)) {
      return res.status(400).send({ message: "userID khong hop le" });
    }

    let messages = await messageModel
      .find({
        $or: [
          { from: currentUserId, to: otherUserId },
          { from: otherUserId, to: currentUserId }
        ]
      })
      .populate("from", "_id username fullName avatarUrl")
      .populate("to", "_id username fullName avatarUrl")
      .sort({ createdAt: 1 });

    res.send(messages);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.post("/:userID", CheckLogin, async function (req, res) {
  try {
    let currentUserId = req.user._id;
    let otherUserId = req.params.userID;
    let payload = req.body.messageContent || req.body;
    let type = payload.type;
    let text = payload.text;

    if (!mongoose.isValidObjectId(otherUserId)) {
      return res.status(400).send({ message: "userID khong hop le" });
    }

    if (!["file", "text"].includes(type)) {
      return res.status(400).send({ message: "type phai la file hoac text" });
    }

    if (!text || typeof text !== "string") {
      return res
        .status(400)
        .send({ message: "text khong duoc de trong va phai la chuoi" });
    }

    let newMessage = await messageModel.create({
      from: currentUserId,
      to: otherUserId,
      messageContent: {
        type: type,
        text: text
      }
    });

    let populated = await messageModel
      .findById(newMessage._id)
      .populate("from", "_id username fullName avatarUrl")
      .populate("to", "_id username fullName avatarUrl");

    res.status(201).send(populated);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

module.exports = router;
