'use strict'

const Promise = require('bluebird')
const Slack = require('slack-node')
const btoa = require('btoa')
const config = require('../config').validate()
const baseRequest = require('request')
const _ = require('lodash')
const Moment = require('moment')


const harvestAPI = baseRequest.defaults({
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${config.harvest_admin_username}:${config.harvest_admin_password}`)}`,
    }
})

const handleSelectProject = 'harvest:handleSelectProject'

const handleSelectTask = 'harvest:handleSelectTask'

const handleHourInput = 'harvest:handleHourInput'

module.exports = (app) => {
    let slapp = app.slapp


    slapp.message('log', ['direct_message'], (msg, text) => {

        msg.say('_Gathering harvest info..._').route(60)

        const slackUserId = msg.body.event.user
        const scope = {}

        getSlackUserEmail(slackUserId, msg.meta.bot_token)
            .then((emailAddress) => {
                console.log('Slack user email: ' + JSON.stringify(emailAddress, null, 2))
                scope.emailAddress = emailAddress
                return getHarvestUserIdWithEmail(emailAddress)
            })
            .then((harvestUserId) => {
                console.log('Harvest user ID: ' + JSON.stringify(harvestUserId, null, 2))
                scope.harvestUserId = harvestUserId
                if(!harvestUserId) {
                    return Promise.reject(`Uh oh, we couldn\'t find your email address ${scope.emailAddress} in Harvest.\nPlease make sure you have an account set up.`)
                }
                return getAllHarvestProjectsForUser(harvestUserId)
            })
            .then((projects) => {
                console.log('Harvest projects for this user: ' + JSON.stringify(projects, null, 2))

                scope.projects = projects

                const projectButtons = buttonsForProjects(projects)

                if (projects.length === 0){
                  msg.say ('You are not assigned to any projects, please contact office admin.')
                    return
                }

                msg.say({
                    text: 'Cool. Let\'s start with a project:',
                    attachments: splitProjectbuttonsWithCancel(projectButtons)
                })
                    .route(handleSelectProject, {projects: scope.projects, harvestUserId: scope.harvestUserId}, 60)

            })
            .catch((err) => {
                if(typeof err === 'string') {
                    msg.say(err)
                }
                else {
                    console.log(err)
                    msg.say('Uh oh, something went wrong.')
                }
            })

    })

    slapp.route(handleSelectProject, (msg, state) => {

        const projects = state.projects

        if(msg.type !== 'action') {
            msg.say({
                text: 'You need to select a project, or cancel.',
                attachments: cancelButton()
            }).route(handleSelectProject, state, 60)
            return
        }

        if(msg.body.actions[0].value === 'cancel'){
            msg.say(returnRandomGoodByeString())
            return
        }

        const selectedProjectId = msg.body.actions[0].value

        console.log(`Selected projectID: ${selectedProjectId}`)


        const selectedProject = _.find(projects,(project) => {
            return project.id == selectedProjectId
        })

        const tasks = selectedProject.tasks

        if(tasks.length === 0) {
            msg.say('There are no tasks for this project. Please contact office admin.')
            return
        }

        const taskButtons = buttonsForTasks(tasks)

        const enrichedState = Object.assign({},
            state,
            { projects, selectedProject, selectedProjectId, tasks })
        msg.say({
            text: `For project *\"${selectedProject.name}\"*, which task are you logging hours for?`,
            attachments: splitTaskButtons(taskButtons)}).route(handleSelectTask, enrichedState, 60)

    })

    slapp.route(handleSelectTask, (msg, state) => {
        const selectedProject = state.selectedProject
        const tasks = state.tasks

        if(msg.type !== 'action') {
            msg.say({
                text: 'You need to select a task, or cancel.',
                attachments: cancelButton()
            }).route(handleSelectProject, state, 60)
            return
        }

        if(msg.body.actions[0].value === 'cancel'){
            msg.say(returnRandomGoodByeString())
            return
        }

        const selectedTaskId = msg.body.actions[0].value

        const selectedTask =  _.find(tasks,(task) => {
            return task.id == selectedTaskId
        })

        console.log(`Selected task ID: ${selectedTaskId}`)

        const enrichedState = Object.assign({},
            state,
            { selectedTaskId, selectedTask })
        msg.say(`For today, How many hours would you like to log for ${selectedTask.name} on *${selectedProject.name}*?`)
            .route(handleHourInput, enrichedState, 60)
    })

    slapp.route(handleHourInput, (msg, state) => {
        const hours = parseFloat(msg.body.event.text)
        if (!hours) {
            msg.say('Please enter a valid numeric character. (i.e 6, 6.5)').route(handleHourInput, state, 60)
            return
        }
        else if (hours <= 0) {
            msg.say('You must enter more than 0 hours').route(handleHourInput, state, 60)
            return
        }
        else if (hours > 24) {
            msg.say('You can\'t enter more than 24 hours in a day').route(handleHourInput, state, 60)
            return
        }


        logHoursToHarvest(state.harvestUserId, state.selectedProjectId, state.selectedTaskId, hours, new Date())
            .then((response) => {

                msg.say()

                const projectButtons = buttonsForProjects(state.projects)
                msg
                    .say({
                        text: `:thumbsup_all: You have successfully logged *${hours}* hours on *${state.selectedProject.name}* :pineappletime: \n` +
                        'Would you like to log more hours on another project?',
                        attachments: splitProjectbuttonsWithDone(projectButtons)

                        })
                    .route(handleSelectProject, state, 60)

            })
            .catch((err) => {
                console.log('Error')
            })
    })
    slapp.message('what is the meaning of life?', ['direct_message'], (msg, text) => {
        msg.say('Try and be nice to people, avoid eating fat, read a good book every now and then, get some walking in and try to live together in peace and harmony with people of all creeds and nations.')
    })
    slapp.message('tell me a story', ['direct_message'], (msg, text) => {
        msg.say(randomStory())
    })
    slapp.message('^(hi|hello|hey|yo|halo|greetings)$', ['direct_message'], (msg, text) => {
        msg.say(returnRandomGreetingString())
    })
    slapp.message('How are you?', ['direct_message'], (msg, text) => {
        msg.say("I'm great but I'm not here to talk about myself, type `help` to see how I can help you log hours.")
    })
    slapp.message('help', ['direct_message'], (msg, text) => {
        msg.say('Right now, I can help you log hours in harvest. Type `log` to start logging your hours.')
    })
    slapp.message('fuck', ['direct_message'], (msg, text) => {
        msg.say("Please keep profanity to a minimum!")
    })
    slapp.message('.*', ['direct_message'], (msg, text) => {
        msg.say(returnRandomString())
    })


    return {}
}

function returnRandomGreetingString() {
    if (Math.random() < 1.0) {
        return (["Hello", "Hey :pineappletime:", "Hey.", "yo", "Hello I'm Harvest Bot, type `help` to see how I can help you.", "Greetings human. :spock-hand:" ])
    }
}

function returnRandomString() {
    if (Math.random() < 1.0) {
        return (["¯\\_(ツ)_/¯ \nType `help` to see how I can help you.", "Hey! :pineappletime:\nType `help` to see how I can help you.", "Totally. Type `help` to see how I can help you.", " I'm Harvest Bot, type `help` to see how I can help you.", ":thinking_face: Type `help` to see how I can help you." ])
    }
}

function getDayOfTheWeek() {
    return Moment().isoWeekday()
}

function getDaysOfTheWeekAray() {
    var daysOfTheWeek = []
    switch (getDayOfTheWeek()) {
        case 1:
            break
        case 2:
            daysOfTheWeek = ['Monday','Today'];
        case 3:
            daysOfTheWeek = ['Monday', 'Tuesday', 'Today']
        case 4:
            daysOfTheWeek = ['Monday', 'Tuesday', 'Wednesday', 'Today']
        case 5:
            daysOfTheWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Today']
        case 6:
            daysOfTheWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday','Saturday']
        case 7:
            daysOfTheWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday','Saturday', 'Today']
        default:
            break
    }
    return daysOfTheWeek
}

function getButtonsForDaysOfTheWeek() {

    var daysOfTheWeek = getDaysOfTheWeekAray()

    const splitButtons = [];
    let j = 0;
    let newButtonGroup = [];
    for (let i = 0; i < daysOfTheWeek.length; i++) {
        newButtonGroup.push(daysOfTheWeek[i])
        if ( (j===3) || (i === daysOfTheWeek.length-1)) {
            splitButtons.push(newButtonGroup);
            newButtonGroup = [];
            j = 0;
        }
        j++;
    }
    const attachments = []
    for (let i = 0; i < splitButtons.length; i++) {
        const action = {};
        const daysButton = {
            name: 'cancel',
            text: 'Cancel',
            type: 'button',
            value: 'cancel',
            style: 'danger',
        }
        let buttons = splitButtons[i];
        if (i === splitButtons.length - 1) {
            buttons.push(daysButton);
        }
        action.text = '';
        action.callback_id = 'select_task';
        action.color = '#2e6be3'
        if (i === 0 ) {
            action.text = '';
        }
        action.actions = buttons;
        console.log(action.actions)
        attachments.push(action);

    }
    return attachments
}

function randomStory() {
    if (Math.random() < 1.0) {
        return (['Once upon a time, in a virtual galaxy far, far away, there was an intelligent young agent by the name of Harvest Bot. One lovely day, Harvest Bot got a job logging hours for the lovely people at Normative, and that was very exciting' , 'What, again?' , "It was a dark and stormy night... no, that's not it." ])
    }
}

function returnRandomGoodByeString() {
    if (Math.random() < 1.0) {
        return ([":wave:", "If you need me, I'll just be here dancing :pineappletime:", "See you later! :floppy-watermelon:", "Farewell. :spock-hand:"])
    }
}

function getSlackUserInfo(userId, authToken) {
    const slack = new Slack(authToken)

    return new Promise((resolve, reject) => {
        slack.api('users.info',
            { user: userId },
            (err, response) => {
                if(err) {
                    reject(err)
                    return
                }

                resolve(response.user)
            })
    })
}

function getSlackUserEmail(userId, authToken) {
    return getSlackUserInfo(userId, authToken)
        .then((userInfo) => {
            return userInfo.profile.email
        })
}

function getAllHarvestProjects() {
    return new Promise((resolve, reject) => {
        harvestAPI.get(config.harvest_api_base_url + '/projects?of_user=1488790', (err, response, body) => {
            if(err) {
                reject(err)
                return
            }
            resolve(JSON.parse(body))
        })
    })
}

function getAllHarvestProjectsForUser(userId) {
    return new Promise((resolve, reject) => {
        harvestAPI.get(`${config.harvest_api_base_url}/daily?of_user=${userId}`, (err, response, body) => {
            if(err) {
                reject(err)
                return
            }
            resolve(JSON.parse(body).projects)
        })
    })
}


function getAllHarvestUsers() {
    return new Promise((resolve, reject) => {
        harvestAPI.get(config.harvest_api_base_url + '/people', (err, response, body) => {
            if(err) {
                reject(err)
                return
            }
            resolve(JSON.parse(body))
        })
    })
}


function getHarvestUserIdWithEmail(emailAddress) {
    return getAllHarvestUsers()
        .then((allUsers) => {
            console.log(allUsers)
            const userWithMatchingEmail = _.find(allUsers,(element) => {
                return element.user.email === emailAddress

            })

            return userWithMatchingEmail && userWithMatchingEmail.user.id
        })
}


function logHoursToHarvest(userId, projectId, taskId, hours, date) {

    const now = new Date()

    return new Promise((resolve, reject) => {
        const bodyJSON =  {
            "notes": "Logged through Slack",
            "hours": hours,
            "project_id": projectId,
            "task_id": taskId,
            "spent_at": Moment().format('YYYY-MM-DD')
        };
        console.log(bodyJSON);
        harvestAPI.post({
            uri: config.harvest_api_base_url + `/daily/add?of_user=${userId}`,
            json: true,
            body: bodyJSON

        }, (err, response, body) => {
            if(err) {
                reject(err)
                return
            }
            resolve(body)
        })
    })
}

function splitTaskButtons(tasks) {
    const splitButtons = [];
    let j = 0;
    let newButtonGroup = [];
    for (let i = 0; i < tasks.length; i++) {
        newButtonGroup.push(tasks[i])
        if ( (j===3) || (i === tasks.length-1)) {
            splitButtons.push(newButtonGroup);
            newButtonGroup = [];
            j = 0;
        }
        j++;
    }

    const attachments = [];
    for (let i = 0; i < splitButtons.length; i++) {
        const action = {};
        const cancelButton = {
            name: 'cancel',
            text: 'Cancel',
            type: 'button',
            value: 'cancel',
            style: 'danger',
        }
        let buttons = splitButtons[i];
        if (i === splitButtons.length - 1) {
            buttons.push(cancelButton);
        }
        action.text = '';
        action.callback_id = 'select_task';
        action.color = '#2e6be3'
        if (i === 0 ) {
            action.text = '';
        }
        action.actions = buttons;
        console.log(action.actions)
        attachments.push(action);

    }
    return attachments
}

function  cancelButton() {
    const attachments = [];
    const action = {};
    const cancelButton = {
        name: 'cancel',
        text: 'Cancel',
        type: 'button',
        value: 'cancel',
        style: 'danger',
    }

    action.text = '';
    action.callback_id = 'select_task';
    action.color = '#2e6be3'

    action.actions = [cancelButton];
    attachments.push(action);
    return attachments
}

function splitProjectbuttonsWithDone(projectButtons) {
    const splitButtons = [];
    let j = 0;
    let newButtonGroup = [];
    for (let i = 0; i < projectButtons.length; i++) {
        newButtonGroup.push(projectButtons[i])
        if ( (j===3) || (i === projectButtons.length-1)) {
            splitButtons.push(newButtonGroup);
            newButtonGroup = [];
            j = 0;
        }
        j++;
    }

    const attachments = [];
    for (let i = 0; i < splitButtons.length; i++) {
        const action = {};
        const cancelButton = {
            name: 'done',
            text: 'Done',
            type: 'button',
            value: 'cancel',
            style: 'primary',
        }
        let buttons = splitButtons[i];
        if (i === splitButtons.length - 1) {
            buttons.push(cancelButton);
        }
        action.text = '';
        action.callback_id = 'select_project';
        action.color = '#2e6be3'
        if (i === 0 ) {
            action.text = 'You\'re currently assigned to these projects:';
        }
        action.actions = buttons;
        console.log(action.actions)
        attachments.push(action);

    }
    return attachments
}

function splitProjectbuttonsWithCancel(projectButtons) {
    const splitButtons = [];
    let j = 0;
    let newButtonGroup = [];
    for (let i = 0; i < projectButtons.length; i++) {
        newButtonGroup.push(projectButtons[i])
        if ( (j===3) || (i === projectButtons.length-1)) {
            splitButtons.push(newButtonGroup);
            newButtonGroup = [];
            j = 0;
        }
        j++;
    }

    const attachments = [];
    for (let i = 0; i < splitButtons.length; i++) {
        const action = {};
        const cancelButton = {
            name: 'cancel',
            text: 'Cancel',
            type: 'button',
            value: 'cancel',
            style: 'danger',
        }
        let buttons = splitButtons[i];
        if (i === splitButtons.length - 1) {
            buttons.push(cancelButton);
        }
        action.text = '';
        action.callback_id = 'select_project';
        action.color = '#2e6be3'
        if (i === 0 ) {
            action.text = 'You\'re currently assigned to these projects:';
        }
        action.actions = buttons;
        console.log(action.actions)
        attachments.push(action);

    }
    return attachments
}

function buttonsForTasks(tasks) {
    return tasks.map((task) => {
        return {
            name: 'taskAnswer',
            text: task.name,
            type: 'button',
            value: task.id,
            style: 'default',
        }
    })
}

function buttonsForProjects(projects) {
    return projects.map((project) => {
        return {
            name: 'projectAnswer',
            text: project.name,
            type: 'button',
            value: project.id,
            style: 'default',
        }
    })
}