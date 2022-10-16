# PoGo-TG-nestbot
Telegram Bot for automated postings of Pokemon Go nests.
![pogo-tg-nestbot](assets/example.png?raw=true)

### Prerequisites
* Git
* NodeJS, NPM
* Telegram Bot ('/newbot' in a chat with the Botfather)

### Installation 
* Clone the source `git clone https://github.com/PickleRickVE/PoGo-Raid-Helper.git`
* Run `npm install` to set up the project
* Add your bot a channel in Telegram
* Copy config.js.example to config.js, edit the latter. Add your bot-token, the channel where to post and choose your language. Replace placeholders with your own selection of nests. Nestnames have to be exactly as in manual db.

### Running
* Run `npm start` (preferred in a tmux or screen session)

### Way of working
* The bot determines the nesting pokemon by analyzing your data and writes back the result to your manualdb.
* The summary will be posted with maplinks for each nest to a Telegram channel.
* The bot can be triggered manually with a post command and runs every two weeks respectively every friday after nest change at 8am.