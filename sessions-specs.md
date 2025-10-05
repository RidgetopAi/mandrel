Sessions User Requirements

    * One unified Sessions table and logic
    * Aidis server running starts session auto defaults to current project (this needs to be changeable either through logic or manually on AIDIS) I will leave this choice to you as if the logic to make this happen automatically adds too much complexity then we can do manually from aidis command or you. But by logic one approach might be where we spent most time..
    * Need a way to indicate or rate a session, even if this is just having manual entry on aidis command under Sessions. But logically i can envision an overall rating that would be derived from context, did initial bug fix/task get done first time? Did the workflow stay true? How many times did we have to do the same thing, was the intial prompt bad?, stored during a session, but i am unclear how to achieve that yet.  What I am describing has a lot of sentiment to it.
    * Need to be able to tie all context and project specific data to that session for future analytics (again have to figure this out) Do store number of context per session, and number of tasks done, tasks completed, token count(as close as we can get) (basic varifiable analytics) 
    * I don't want to overcomplicate this just the things necessary to accomplish goals
    * Active session: let's just make this simple and if server is running it's active, or last session that was active would be the acitve session if server is down(I'm referring to the mcp server), I think there is a lot of complex logic (supposedly) in to determine active session criteria....If it is strip it out, (I agree I need to understand what we built completly), we can always add later. 
    * Inactive sessions: of course if not active 
    * Disconnected: This functionality is for future projects (everything should flow through PROJECTS) or even current ones if they need to be retired, this would apply: Once disconnected no more read/write/delete from data base. Archived Project (future implement) 
    * Assigning Agent - ideal is auto recognize, but i understand that might be difficult...so for this one I am going to leave up to you best way to handle this....I can do manual if it's to complex (when i say complex I mean risky, unsure of task or capabiltities, remember honesty gets us way farther along to our end goal, doesn't mean over simplification, strike that balance) 
    * Displaying Details on click: session_duration, contexts_created (clickable filtered to that session, display next availble space on page), project_name, session_id (this needs to be searchable by you and user - is the parent), 
    * Session Analytics show on Details page as described above.
    * Timeline Visual: If possible a time line showing context stores, tasks created and checked off) a way to see hard activity to the db 
    * created_date:time
    * session_timeout: Let's make this 2 hours inactivity: meaning no llm activity or user activity
    * need ability to change session_name: auto assign name upon start with session_id but let's make the session_display_id user readable.
    * Need ability to change project_name in case of wrong assingment or a change. Make warning sign on first click and user has to click again.
    * Clickable edit-> Can enter user descriptive information about session, session_title, session_description area {2,000 char}, date_created, time_created 
    * filter by: text, status_drop_down, project_drop_down
    * Show all sessions below filter on main session page, newest first - oldest last
    * I am sure I am missing something basic and if so you can certainly make suggestion

