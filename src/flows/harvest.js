'use strict'

const Slack = require('slack-node')
const config = require('../config').validate()

const slack = new Slack()

const handleLogHoursForProject = 'harvest:handleLogHoursForProject'

module.exports = (app) => {
  let slapp = app.slapp

  slapp.message('.*', ['direct_message'], (msg, text) => {

    const slackUserId = msg.body.event.user

    slack.api('users.info',
      { user: slackUserId, token: msg.meta.bot_token },
      (err, response) => {

        if(err) {
          msg.say('Uh oh, we couldn\'t get your Slack user information.')
          return
        }

        console.log(response)

        msg
          .say({
            text: 'Log hours for which project?\nYou\'re currently assigned to these projects:',
            attachments: [
              {
                text: '',
                callback_id: 'test',
                actions: [
                  {
                    name: 'answer',
                    text: 'Mock Project 1',
                    type: 'button',
                    value: '1',
                    style: 'default',
                  },
                  {
                    name: 'answer',
                    text: 'Mock Project 2',
                    type: 'button',
                    value: '2',
                    style: 'default',
                  }
                ]
              }
            ]})
          .route(handleLogHoursForProject, {})
    })


  })

  slapp.route(handleLogHoursForProject, (msg) => {
    msg.say('Thanks.  We haven\'t built this feature yet.')
  })

  return {}
}
