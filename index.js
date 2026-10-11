const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
dotenv.config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express()
const port = process.env.PORT
const uri = process.env.MONGO_DB_URI;

app.use(cors())
app.use(express.json())

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();

        const db = client.db('bazar-card');
        const cardsCollection = db.collection('cards');
        const subscriptionsCollection = db.collection('subscriptions');

        // 1. Get All Cards (Admin / User)
        app.get('/api/cards', async (req, res) => {
            try {
                const cards = await cardsCollection.find({ isDeleted: { $ne: true } }).toArray();
                res.status(200).json({ success: true, data: cards });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // 2. Create Card
        app.post('/api/admin/cards', async (req, res) => {
            try {
                const cardData = {
                    ...req.body,
                    isActive: true,
                    isDeleted: false,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                const result = await cardsCollection.insertOne(cardData);
                res.status(201).json({ success: true, message: 'Card created successfully', data: result });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        app.put('/api/admin/cards/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const updateData = {
                    ...req.body,
                    updatedAt: new Date()
                };
                delete updateData._id;

                const result = await cardsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updateData }
                );
                res.status(200).json({ success: true, message: 'Card updated successfully', data: result });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        app.patch('/api/admin/cards/:id/toggle-status', async (req, res) => {
            try {
                const id = req.params.id;
                const card = await cardsCollection.findOne({ _id: new ObjectId(id) });
                if (!card) {
                    return res.status(404).json({ success: false, message: 'Card not found' });
                }

                const result = await cardsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { isActive: !card.isActive, updatedAt: new Date() } }
                );
                res.status(200).json({ success: true, message: 'Status toggled successfully', isActive: !card.isActive });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        app.delete('/api/admin/cards/:id', async (req, res) => {
            try {
                const id = req.params.id;

                const activeSubscription = await subscriptionsCollection.findOne({ cardId: new ObjectId(id) });
                if (activeSubscription) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot delete! Active subscriptions exist for this card. Use deactivation instead.'
                    });
                }

                const result = await cardsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { isDeleted: true, isActive: false, updatedAt: new Date() } }
                );

                res.status(200).json({ success: true, message: 'Card soft-deleted successfully' });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        //Create Subscription (User selects a card)
        app.post('/api/subscriptions', async (req, res) => {
            try {
                const subscriptionData = {
                    ...req.body,
                    cardId: new ObjectId(req.body.cardId),
                    status: 'active',
                    paymentStatus: 'unpaid',
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                const result = await subscriptionsCollection.insertOne(subscriptionData);
                res.status(201).json({
                    success: true,
                    message: 'Card subscribed successfully! Added to My Cards.',
                    data: result
                });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // 4. Get Subscriptions by User ID
        app.get('/api/subscriptions/:userId', async (req, res) => {
            try {
                const userId = req.params.userId;
                const subscriptions = await subscriptionsCollection.find({ userId: userId }).toArray();

                // Fetch associated card details if needed or return subscription data
                res.status(200).json({ success: true, data: subscriptions });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // 5. Update Subscription Start Date (Editable only before start)
        app.patch('/api/subscriptions/:id/date', async (req, res) => {
            try {
                const id = req.params.id;
                const { startDate } = req.body;

                const result = await subscriptionsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { startDate: startDate, updatedAt: new Date() } }
                );

                res.status(200).json({ success: true, message: 'Start date updated successfully', data: result });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // 6. Pause / Cancel / Update Subscription Actions
        app.patch('/api/subscriptions/:id/status', async (req, res) => {
            try {
                const id = req.params.id;
                const { status } = req.body; // e.g. 'paused', 'cancelled', 'active'

                const result = await subscriptionsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: status, updatedAt: new Date() } }
                );

                res.status(200).json({ success: true, message: `Subscription status updated to ${status}`, data: result });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        app.patch('/api/subscriptions/:id/pay', async (req, res) => {
            try {
                const id = req.params.id;
                const result = await subscriptionsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { paymentStatus: 'paid', updatedAt: new Date() } }
                );
                res.status(200).json({ success: true, message: 'Payment successful', data: result });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });



        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Bazar Card Server!')
})

app.listen(port, () => {
    console.log(`Bazar Card Server listening on port ${port}`)
})