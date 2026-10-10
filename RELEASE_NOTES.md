# Release Notes

User-friendly, scannable summary of every Trusted Servants Pro version
bump. The deeper, version-by-version implementation log lives in
[CHANGELOG.md](CHANGELOG.md).

The same content appears in-app under Settings → About, with the
release notes expanded by default and the changelog collapsed.

## Unreleased

New features:

- Access requests open on their own page, with the whole message

## 3.2.1 — 2026-10-10 (latest)

Fixes:

- a security flaw in CairoSVG, which renders uploaded SVG logos (CVE-2026-107378)

## 3.2.0 — 2026-10-10

New features:

- Settings dialogs open as pages with a back button
- Add user opens as its own page
- Role cards in Add user and Edit user
- Reset password from Edit user
- Sidebar link preview while typing its title

Changes:

- Settings pages laid out in sections across the full width
- Sidebar link forms keep their own Create and Save buttons
- A failed Add user reopens with what was typed

Fixes:

- closing a sidebar link dialog closing all of Settings
- city, state and zip running past the location form

## 3.1.2 — 2026-10-08

Changes:

- More space between the featured image and the cards on event and announcement pages

## 3.1.1 — 2026-10-07

Changes:

- Spinner on the Users page Create button while the account is created

Fixes:

- the Settings close button vanishing over a scrolled section

## 3.1.0 — 2026-10-06

New features:

- JetBrains Mono and Space Grotesk in the font picker
- Sign-in and password reset links emailed when an existing account requests access
- Existing account shown on a Watchtower request, with Reset Password

Changes:

- Redesigned website themes, light and dark, styling every public page
- Quieter Classic theme with a deep ink dark mode
- Modern Dark theme with glass panels under aurora light
- Cyberpunk theme as a neon heads-up display with cut-corner panels
- Sanctuary theme, warm and bookish, with a candlelit dark mode
- Terminal theme with windowed panels and bracketed buttons
- Neobrutal theme with its own color for each part of the site
- Same access request reply for everyone, whether or not they have an account
- Email addresses as usernames for new accounts
- Username filled in from the email on Create user
- Changed usernames must be email addresses
- Usernames up to 255 characters
- First admin on a new install signs in with the admin email
- Pop-ups opened from Settings no longer dim the page behind

Fixes:

- the phone menu covering the logo in five site themes
- the email shown twice for accounts whose username is their email
- the Settings Users and Locations sections cut off below the close button

## 3.0.3 — 2026-10-06

Fixes:

- a security flaw in Werkzeug affecting servers on Windows (CVE-2026-102598)

## 3.0.2 — 2026-10-06

Changes:

- More space between a meeting's heading and its cards in the Classic layout

## 3.0.1 — 2026-10-06

Changes:

- Shorter 3.0.0 notes in About and What's new

Fixes:

- library items with no file breaking the Literature Library and meeting pages

## 3.0.0 — 2026-10-05

New features:

- File view in the File Browser with details, image zoom and arrow-key stepping
- Alert bar for signed-in users in Settings, Alert Bar
- Request access popup on the public site, beside Login
- Light and Dark admin looks per account, with Follow system
- Server card on the dashboard and site status strip on the Overview
- Site width setting on Design, Layout
- Email List history of sent updates with delivery status and Use again
- Zoom Accounts Calendar view and 15-second password reveal or copy
- Convert blog posts and Zoom Tech Training between Markdown and blocks
- Design tab for Zoom Tech Training
- Editable Contact form fields
- Featured images from the File Browser and WebP conversion for stories and blog posts
- Approve and Reject for submitted stories, showing the sender
- Custom order for library files by dragging
- Footer dark colors, built copyright line, icon picker and new-tab links
- Old page address redirected after a change, past addresses listed on blog posts
- Dynamic background can be turned off on Contact and Recovery Contacts pages
- Back button in a library's sidebar

Changes:

- One list layout with live search, filters, sort, List or Grid and bulk actions
- Meetings, Zoom accounts, libraries, posts and lists edited on their own pages
- One Markdown editor for posts, stories, blog posts and meetings, with live preview
- Web Frontend and Branding editors with a live preview beside their settings
- Header and Navigation merged into one Header page, menus edited in place
- Design page holds theme, fonts, mega menu and footer looks, with sliders and changed-setting dots
- Web Frontend menu regrouped, Pages, Popups and Forms open straight into their editor
- Simpler Caching, Privacy & cookies, Redirects, layout cards and Classic header
- Homepage locked public, layouts applied to a page's draft, privacy policy starts as a draft
- File Browser and file picker sidebar, column sort, one menu per file and readable sizes
- Zoom calendar at real hours in account colors, deleted accounts cleared from meetings
- Email List updates sent with Markdown, reach count and confirmation
- Settings with one save bar, card sections, reworked Users and Global, Public Information Chair there
- Uniform dashboard widgets, smoother rearranging, email list widget removed
- Watchtower tabs and request lists load in place
- Two-column meeting page with today marked in the schedule
- Blog posts and Zoom Tech Training written in Markdown, full-screen training photos
- Messages and form submissions open on their own page
- Recovery Contacts waiting items split into New, Update and Removal
- New users start as Viewer and join the Email List
- Neobrutal, Cyberpunk and Solarpunk admin themes removed
- Consistent admin spacing, full-width pages, icon sidebar, unified switches and highlights
- Search as you type everywhere, phone filters behind a button with chips
- Richer grid cards and merged meeting schedule days
- New meetings open in their editor, rename without reload, libraries optional
- Confirmation before deleting posts and meetings
- Bulk-deleted library files go to the Delete Log
- Darker light-mode hovers, faded unavailable buttons, amber dark-mode alerts, link-out icons
- Pro Tips and sidebar links removed from the Meetings list

Fixes:

- Download in the File Browser fetching the wrong file
- redirects able to take over /tspro, /static or /pub addresses
- pages flashing unstyled while loading, help pop-ups cut off
- turning a module off failing with "HTTP 404"
- saving form settings changing public forms or accepted file types
- the Footer page failing, footer gradient and color settings lost on save
- the mega menu Search block not opening site search
- the site description and link preview address sent to search engines and sharing
- Cookie Compliance "0 days" and the banner linking a deleted policy
- the Marketing landing layout missing its sections
- a blank built-in form address losing its usual address
- the Dots underline, Neobrutal fonts and green badges in light mode

## 2.20.2 — 2026-09-30

Changes:

- Featured image on announcement, event and archive pages takes the card shadow set under Design

## 2.20.1 — 2026-09-29

Changes:

- Every admin switch to the left of its caption

## 2.20.0 — 2026-09-27

New features:

- Password generator on Create User
- Checklist showing whether a typed password meets the rules
- All release notes on GitHub button in About

Changes:

- Reset password generates 20-character passwords
- Checkboxes and radio buttons to the left of their label in boxed options
- One Actions menu per Watchtower access request
- Watchtower requests as cards on phones
- Roles on access requests listed one per line
- Watchtower tabs in one swipeable row on phones
- Settings sections in a left sidebar, grouped under Account and Administration
- Settings opens to its section list on phones
- About release notes limited to the current version line
- Changelog section removed from About

## 2.19.10 — 2026-09-23

New features:

- Dates on search results for announcements, events, stories and blog posts
- Live preview beside the announcement and event Body
- Edit queued schedule changes
- Undo canceling a queued schedule change before saving
- Past-date warning when saving a duplicated draft

Changes:

- Queued schedule changes listed straight away, marked unsaved

Fixes:

- the meeting Save button skipping other unsaved edits after queuing a schedule change
- the library reading editor's Write and Preview tabs splitting into two columns

## 2.19.9 — 2026-09-17

New features:

- Axes, scales and dates on Watchtower charts
- Hover readout on Watchtower charts
- Keyboard readout on Watchtower charts
- View as table link under every chart

Changes:

- Chart scales end on readable numbers
- Solid gridlines on the Visitors chart

Fixes:

- Visitors chart labels stretching on wide screens

## 2.19.8 — 2026-09-16

New features:

- Top source IPs panel on the Watchtower 404s tab
- Scanning marker for an address hitting many dead URLs
- Block button on top source IPs
- Your IP marked in Watchtower

Changes:

- Warning before blocking your own IP, on every Block button

Fixes:

- misaligned bars and counts in the 404s ranked lists
- smaller text on the Watchtower sidebar button

## 2.19.7 — 2026-09-16

Changes:

- Pattern tile backgrounds start their repeat at a slightly different position

Fixes:

- faint hairlines across Pattern tile backgrounds
- uneven ribbon spacing in the Waves 15 motif

## 2.19.6 — 2026-09-16

Fixes:

- container block backgrounds ignoring the chosen pattern
- container block backgrounds dropping scale, line weight, rotation and dot settings
- Freeze movement having no effect on container block backgrounds

## 2.19.5 — 2026-09-16

New features:

- Shade lightness slider per mode for dynamic backgrounds
- Randomize pattern checkbox for dynamic backgrounds
- Roll button to pick and keep a random motif
- Shuffle sample to preview randomized patterns

Changes:

- Darker dark-mode random colors on existing surfaces
- Unused Shade lightness slider grayed out
- Roll colors and Shade lightness at the top of the Colors section
- Background and Gradient direction moved into the Colors section
- Preview and tabs fixed at the top of the dynamic background window
- Setting explanations behind an info icon in the dynamic background window

Fixes:

- the color randomizer giving dark mode light palettes

## 2.19.4 — 2026-09-16

New features:

- Hero particle color per light and dark mode
- Hero particle opacity per mode
- Markdown and inline HTML in the hero subheading
- Blue (filled) hero button style
- Roll colors button for dynamic backgrounds
- Roll positions and Reset layout for dynamic backgrounds

Changes:

- Hero particle controls in Light mode and Dark mode columns
- Particle Size slider grayed out when the effect ignores it
- Each randomize toggle with its own button
- Show tagline in hero explains an empty Tagline
- Token badges with hover text naming the control and token

Fixes:

- Green (filled) and Yellow (high-contrast) not darkening on dark-pinned heroes
- button icons showing as reference names in the hero preview
- long headings pushing buttons out of the hero preview
- the hero preview wrapping headings earlier than the live page
- turning Colors off overwriting the color slots
- broken outlines on color swatches
- color chips misaligned with the controls below them
- token badges describing a color the field no longer holds
- dashboard widget empty states in different sizes
- long settings labels cut off
- missing bottom border on the last card in a list
- the Web Frontend Status toggle cards sitting too close

## 2.19.3 — 2026-09-15

Changes:

- Admin text a step larger than in 2.19.2

## 2.19.2 — 2026-09-15

Changes:

- Admin text on one consistent, smaller scale
- Buttons a step below body text

Fixes:

- dashboard widget empty states and titles in mixed sizes
- the Auto-hide app sidebar row cut off in Web Frontend Status
- missing bottom border and cramped toggle cards in Web Frontend Status

## 2.19.1 — 2026-09-15

New features:

- Staging sync failure reason shown under the status
- Click the Staging sync status to check again

Fixes:

- Staging sync reporting Unreachable after one slow lookup

## 2.19.0 — 2026-09-15

New features:

- Separate light and dark mode dynamic backgrounds
- Shuffle preview button per mode
- Saturation, Brightness and Color fill sliders per mode
- Speed control for Aurora blobs
- Pattern tile background with 330 patterns
- Pastel wash slider on Classic backgrounds
- Editor reopens your pop-up after a reload

Changes:

- Existing backgrounds kept as Classic versions, switchable per surface
- Dotted grid and Diagonal lines marked Retiring
- Explanations behind an info icon across the admin
- Saving with the yellow bar keeps your place
- Save bar shown on pop-up editors
- Event posts archive by their end date

Fixes:

- Aurora bands removed, leaving pages without a background
- the live meetings bar colliding with its buttons on narrow windows
- Templates page card descriptions running into their titles
- empty background preview thumbnails
- background settings lost on save
- ragged utility bar editor rows
- the Open in new tab checkbox not looking like a checkbox

## 2.18.10 — 2026-09-14

New features:

- Archive and restore libraries
- Actions menu on Libraries and Meetings tables

Changes:

- One Actions menu on every admin list row
- Pending review tab turns amber when something waits
- One red bin delete button everywhere, with a tooltip

Fixes:

- the sidebar jumping to the top on every page load
- sidebar Forms links opening an empty Pending review tab
- published stories showing an empty Status
- broken row lines in the File Browser
- phones zooming in on Intergroup Officers and Fellowships Index fields

## 2.18.9 — 2026-09-14

Changes:

- PDF engine updated

## 2.18.8 — 2026-09-14

New features:

- Rename button on the Pages list
- Forward the old address when renaming a page
- Renamed marker in page History
- Drag to reorder List block items

Changes:

- Renaming a page back removes the old forward
- Page renames carry into unpublished drafts
- Page row buttons behind one Actions menu
- Pages as compact cards on phones
- Fellowships remove button matches the others
- Homepage row highlight removed

Fixes:

- admin lists running off the side of the screen
- Intergroup Officers and Fellowships Index unreadable on phones
- fields zooming the page on tap in Intergroup Officers and Fellowships Index

## 2.18.7 — 2026-09-01

Changes:

- Card styles columns stack on narrow windows

Fixes:

- the Secondary card styles column running off the page
- field titles sliding under the Synced badge

## 2.18.6 — 2026-09-01

New features:

- Submit button on the Events list
- Submission panel at the foot of announcement, event and archive pages

Changes:

- One Submit button setting controls every placement
- Live dot moved from Web to View in the sidebar

## 2.18.5 — 2026-08-11

New features:

- Public visibility setting on every post

Changes:

- Duplicated posts reset to follow the post's status
- Auto-archive help explains that archived posts stay public

Fixes:

- tall featured images cropped on post pages
- archived posts' featured images broken for visitors
- fresh installs failing on first boot

## 2.18.4 — 2026-08-11

Fixes:

- a security flaw in the encryption library
- scheduled event posts showing early in Upcoming Events
- scheduled posts showing in site search before their date
- submissions awaiting review appearing in site search

## 2.18.3 — 2026-08-10

New features:

- Use address button for the Google Maps link
- Click a shortened IPv6 address to see it in full

Changes:

- Post editor explains when posts auto-archive
- Date-tag picker renamed Insert dynamic date & time tags

Fixes:

- long IPv6 addresses stretching Watchtower tables

## 2.18.2 — 2026-08-01

Changes:

- Edge-to-edge editing panels on phones, with pinned Save and Cancel
- Fellowships Index and Watchtower Access tables as cards on phones
- Fellowships Index remove button reads Delete
- Virtual toggle left-aligned in the Fellowships Index
- Fading edges on button rows with more to swipe

Fixes:

- Settings, Modules squeezed on narrow screens

## 2.18.1 — 2026-07-31

Fixes:

- visitor IPs behind Cloudflare recorded as Cloudflare's

## 2.18.0 — 2026-07-31

New features:

- Two-factor authentication required for admins
- TSP_SESSION_DAYS setting for sign-in length

Changes:

- Full security review with every finding fixed
- Links in forms, pages, footers and menus checked
- Uploaded logos and icons sanitized
- Rate limits on password-reset emails and the Recovery Contacts form
- Third-party components updated
- Off-site imports and PDF generation locked down

Fixes:

- a way around the sign-in lockout
- large uploads straining server memory

## 2.17.0 — 2026-07-21

New features:

- Event date tags in a post's GSR Summary and Body
- Tags for the whole date or each part
- Tag picker in the post editor with live previews
- Event date tags in announcement-only posts
- Warning when tags are used without a start date

## 2.16.9 — 2026-07-16

Changes:

- Manage on an off-site backup opens that backup's settings

## 2.16.8 — 2026-07-16

Fixes:

- off-site backups leaving stray files on the server

## 2.16.7 — 2026-07-16

Changes:

- Powered by Trusted Servants Pro line in emails links to gettspro.com

## 2.16.6 — 2026-07-04

Changes:

- Published by Hyprlab, formerly Viibeware
- Hyprlab credit in About and on the login screen
- Docker image now hyprlab/tspro, code at github.com/hyprlab/trusted-servants-pro

## 2.16.5 — 2026-06-28

Changes:

- PNG made automatically from SVG logos for emails

Fixes:

- header logo missing from notification emails

## 2.16.4 — 2026-06-27

Changes:

- Password reset confirmation as two toasts

Fixes:

- password resets sending a welcome email

## 2.16.3 — 2026-06-27

Fixes:

- email logos blank in Thunderbird
- email logos not using the configured site address

## 2.16.2 — 2026-06-27

New features:

- Creating a user from an access request archives the request

Changes:

- Requests list updates on the spot
- Wider Settings window on desktop

Fixes:

- Edit and Delete pushed off the Users tab on small screens

## 2.16.1 — 2026-06-21

Fixes:

- the save bar button spilling out while showing "Saving…"

## 2.16.0 — 2026-06-21

New features:

- Google Meet and Microsoft Teams links on meetings
- On/off switch per meeting platform
- Join buttons and copyable IDs for Meet and Teams on public pages
- IP address recorded on access requests
- Block IP and Unblock on Watchtower requests

Changes:

- External Links card under Libraries on the admin meeting page

## 2.15.13 — 2026-06-15

New features:

- Archive and delete buttons on every submission row

## 2.15.12 — 2026-06-15

Changes:

- View button on every submission row, even collapsed

## 2.15.11 — 2026-06-15

Changes:

- View Submission opens a popup

## 2.15.10 — 2026-06-15

New features:

- Link previews for custom forms, with an uploadable image

Changes:

- Submission rows open and close smoothly

## 2.15.9 — 2026-06-15

New features:

- Expand a submission in the inbox
- View Submission button on expanded rows

## 2.15.8 — 2026-06-15

New features:

- View on frontend button on a form's submissions page

Fixes:

- collapsed sidebar sections popping open on page change

## 2.15.7 — 2026-06-15

Changes:

- Submission counts behave like an unread inbox
- Clicking a notification clears it
- Your Access explains per-form submission access

Fixes:

- opening a form's entries collapsing the main sidebar

## 2.15.6 — 2026-06-15

Changes:

- Branded, mobile-friendly design for every email the site sends
- Confirm and I didn't request this buttons in the listing confirmation email
- Blue submission-count chips in the sidebar Forms section

## 2.15.5 — 2026-06-15

New features:

- Per-form submission access for Editors, Intergroup Members and Viewers
- Forms area in the sidebar with each form's inbox, archive and CSV download
- Unread submission counts on the Forms list
- Form submissions in the Notifications Center
- Per-form dynamic background
- Submit another response button after submitting
- Link to the submission in notification emails

Changes:

- Contact, Announcements/Events, Story and Recovery Contacts forms in the sidebar Forms area
- Email-style submission view
- Submitting spinner on public forms
- Form description hidden after a successful submission
- Orange submission chip in the sidebar

Fixes:

- a double tap sending a form twice
- submissions recording an IPv6 form of the visitor's IPv4 address

## 2.15.4 — 2026-06-15

New features:

- Branded submission notification emails
- Archive and Restore buttons on the submission detail page

Changes:

- Only selected options listed in submission emails
- Import to Stories button removed from the submission detail page

Fixes:

- SVG logos not showing in emails

## 2.15.3 — 2026-06-15

Changes:

- Single full-name box for the Name field, with a placeholder
- Field help text under the field title
- More space between a form's description and its first field

Fixes:

- checkboxes and radio buttons stacked above their labels

## 2.15.2 — 2026-06-15

New features:

- View on frontend button in the form editor and Forms list

Changes:

- Empty dropdown, radio and checkbox fields hidden on public forms
- Submit button at the bottom right of public forms

Fixes:

- the public form description pushed aside and fields squeezed

## 2.15.1 — 2026-06-15

New features:

- Active and Archived tabs on Custom Form Submissions
- Bulk archive, restore and delete of submissions
- CSV download of a form's submissions
- On/off switch for each custom form on the Forms list

Changes:

- Field editor opens when you click the field block
- Form editor settings cards stay open

Fixes:

- bulk action buttons shown before anything was selected
- form editor card titles looking clickable

## 2.15.0 — 2026-06-14

New features:

- Name field with First name and Last name boxes
- Form URL slug filled in from the form name
- Multi-delete on the Forms page
- Auto convert to WebP option for featured images on Announcements/Events

Changes:

- Field editor as a centered pop-up
- Add field drops a labeled block without opening the editor
- Save bar shown at once on a new form
- Save settings button removed from the form editor
- Blue number badges on the Web Frontend dashboard and Notifications

Fixes:

- announcement and event submission times shown in UTC
- the Web Frontend side menu sliding under the top bar
- the main sidebar bouncing on over-scroll
- the form URL field failing validation in recent browsers

## 2.14.4 — 2026-06-14

Changes:

- Currently online lists only people working in the admin area

## 2.14.3 — 2026-06-14

Fixes:

- Turn off two-factor doing nothing for non-admin roles
- spacing on the two-factor setup screen

## 2.14.2 — 2026-06-13

Changes:

- Users list two-factor toggle follows changes to your own two-factor
- Two-factor described as available rather than required

Fixes:

- two-factor notice and Turn off button staying after turning it off

## 2.14.1 — 2026-06-13

New features:

- Two-factor toggle per user in Settings, Users
- Two-factor for every role
- Two-factor setup wizard at sign-in, with Skip for now
- Own two-factor managed in Settings, Your Access

Changes:

- Two-factor on by default for new admin accounts

## 2.14.0 — 2026-06-13

New features:

- Optional two-factor authentication for admin accounts
- Ten one-time recovery codes, regenerable
- Password required to turn off two-factor or regenerate codes

## 2.13.2 — 2026-06-13

Fixes:

- toasts covering the top bar buttons

## 2.13.1 — 2026-06-12

New features:

- Full search results page with type filter and sort
- Search palette remembers the last search, with a Clear button
- See all results button in the search palette

Changes:

- Search results filter and sort in place, with Back and Forward

Fixes:

- stray formatting tags in search snippets

## 2.13.0 — 2026-06-12

Changes:

- Post editor fields reordered, Publishing card merged into the top card
- Regular font in post editor fields
- Featured image thumbnail shown at once on pick or remove
- Auto-archive switch and date as one panel
- Remove current image as a red pill
- Page header pinned while scrolling and full width
- Page header matches the sidebar background and dark mode
- Swipeable header buttons on phones

## 2.12.6 — 2026-06-11

Changes:

- Trusted Servants sign-up widget always starts blank, for shared accounts
- Intergroup libraries left out of the Libraries dashboard widget

## 2.12.5 — 2026-06-10

New features:

- Scheduled announcements and events
- Search across every post type, Stories, Blog posts, Pages and Settings
- Filter, sort and multi-delete on Users
- Rollback snapshots button in Settings, Data
- Scheduled badge and Today button for posts
- Search jumps to Settings tabs and Web Frontend pages

Changes:

- Custom post URL on a draft kept through publishing
- Dashboard as a pinned sidebar button

Fixes:

- the post editor scrolling sideways on phones

## 2.12.4 — 2026-06-09

New features:

- Rollback snapshots button on the Staging Sync card, with downloads
- Restore instructions in the rollback snapshots popup

Changes:

- Ten most recent rollback snapshots kept

## 2.12.3 — 2026-06-09

New features:

- Pull and Push buttons on a Staging copy's Web Frontend overview, with connection status

## 2.12.2 — 2026-06-09

Changes:

- Staging sync wizard asks whether the install is Live or Staging
- Prompt to set up the Live site first

Fixes:

- the Settings window closing during staging sync setup

## 2.12.1 — 2026-06-09

New features:

- Step-by-step staging sync setup wizard
- Pair token shown with a Copy button

Fixes:

- the Settings window closing while generating a token, saving, testing or syncing

## 2.12.0 — 2026-06-08

New features:

- Frontend staging sync: pull or push the frontend between two installs
- Rollback snapshot saved before each sync
- Allow inbound opt-in and shared token for sync

## 2.11.1 — 2026-06-08

Changes:

- Hour-of-day charts follow the Settings timezone
- Active timezone shown on hour-of-day charts

## 2.11.0 — 2026-06-07

New features:

- Remote restore from the TS Pro Backup console without signing in
- Allow remote restore option per backup target

## 2.10.9 — 2026-06-05

Changes:

- Sidebar and dashboard badges update without reloading

Fixes:

- Currently Online counting people who had left

## 2.10.8 — 2026-06-02

Fixes:

- encrypted FTP, SFTP and Dropbox backups failing on large portals
- the Dropbox wizard showing "connection failed" on the first Continue

## 2.10.7 — 2026-06-02

New features:

- Disk tile on the dashboard Server panel

## 2.10.6 — 2026-06-02

New features:

- Low disk space banner and notification above 85% full

Changes:

- Daily cleanup of unused Docker images and build leftovers

## 2.10.5 — 2026-06-02

Fixes:

- old app images and logs filling the server disk

## 2.10.4 — 2026-06-02

Changes:

- Configurable scratch directory for backups

Fixes:

- off-site backups failing with "database or disk is full"

## 2.10.3 — 2026-06-02

New features:

- Dynamic Background picker for the Contact and Recovery Contacts pages
- Color-coded type labels on Off-site Backups, Manage

Changes:

- Backup connection editor with a type banner and wider fields
- WordPress importer moved to the bottom of Settings, Data

Fixes:

- backups stuck on "Running" after a restart

## 2.10.2 — 2026-06-01

New features:

- End-to-end encrypted off-site backups to TS Pro Backup
- Encryption key fingerprint in the TS Pro Backup setup wizard
- Private-key restore on the TS Pro Backup Restore page
- Import of encrypted TS Pro Backup files in Settings, Import
- Attention chips on each Watchtower tab
- Needs attention panel on the Watchtower Overview

Fixes:

- Run now reporting an error after a successful backup

## 2.10.1 — 2026-05-31

New features:

- Test connection button and status pill for the API relay

## 2.10.0 — 2026-05-30

New features:

- API relay sending method for hosts that block SMTP
- Companion relay app with its own dashboard and send log

Changes:

- SMTP fields hidden in relay mode

## 2.9.5 — 2026-05-30

New features:

- Guided Zoom launcher on meeting pages
- Zoom one-time passcodes retrieved automatically, with an expiry countdown
- Zoom OTP inbox settings in Settings, Security
- Retrieve latest code on meeting pages and Zoom Accounts

Changes:

- Meeting page Zoom, Schedule and Location cards, with Open in Maps
- Meeting locations matched to saved locations despite typos

Fixes:

- one-time passcodes missed around midnight UTC
- background API polls counted in visitor metrics

## 2.9.4 — 2026-05-29

New features:

- Background and Options tabs with live preview in the Dynamic Background picker
- Per-preset sliders and overlay Scale and Intensity sliders
- Foreground and background colors for dotted-grid and diagonal-lines patterns

Changes:

- Only the options that apply shown for each background preset
- Starfield, Noise paper and Spotlight glow backgrounds removed
- Recovery Blue header sticky on phones
- Animated hamburger menu in Recovery Blue

Fixes:

- the swipe utility bar peeking the next item at rest
- signed-in footer auth buttons misaligned on phones

## 2.9.3 — 2026-05-28

New features:

- Card body preview setting on announcement and event list templates
- Read more link on announcement and event cards

Changes:

- Event cards show a truncated body

## 2.9.2 — 2026-05-28

New features:

- Pastel strength slider in the Dynamic Background picker

Changes:

- Paler maximum pastel strength
- Themed shadow on detail page featured images, border removed
- Detail page featured image at one third of the width
- Larger meeting detail logo on desktop

## 2.9.1 — 2026-05-28

Fixes:

- the Dynamic Background picker opening behind the template modal
- users stuck online on /api/live-meeting

## 2.9.0 — 2026-05-28

New features:

- Page drafts with Save Draft and Publish buttons
- Publish draft button and draft banner in the page editor
- Unpublished changes chip on the Pages list
- Page edit history with restore, last 50 saves
- Live-updating page preview

Changes:

- Save Draft button colors match Publish

Fixes:

- two-column containers moving blocks between columns on save
- the Unplaced blocks bin hard to read
- status chips colliding on the Pages list

## 2.8.3 — 2026-05-28

New features:

- Live-updating content page preview

Changes:

- Unplaced blocks stacked vertically like placed blocks

Fixes:

- lists directly under a paragraph not rendering in announcement and meeting bodies
- SVG image blocks not scaling to the chosen width

## 2.8.2 — 2026-05-26

New features:

- CSV export of visitor metrics on Watchtower, Visitors
- Tooltips on the daily traffic chart

Changes:

- Visitors chart legend on the right and aligned donut grid
- Full breakdown on donut slice hover

Fixes:

- events auto-archiving on the wrong day

## 2.8.1 — 2026-05-26

New features:

- Source IPs and one-click blocking on Watchtower 404s
- Blocked chip for IPs already on the blocklist

Changes:

- Ban reason filled in with the 404 path

## 2.8.0 — 2026-05-26

New features:

- Cookie Compliance module with GDPR, CCPA and generic presets
- Notice, Consent and Strict opt-in cookie prompt modes
- Cookie prompt adapted to visitor region
- Starter privacy policy generator
- Editable cookie banner text, buttons and position
- Privacy and cookies footer block

Changes:

- Visitor Metrics moved to Watchtower, Visitors
- Unique visitors as the default traffic number

Fixes:

- sidebar Web, View and Watchtower pills underlined on hover

## 2.7.5 — 2026-05-26

New features:

- Redirect any 404 from Watchtower in one click
- Wildcard redirects
- Show more on the top URL, path and referrer lists in Watchtower
- Redirected chip on handled 404 rows
- Use /* helper in the redirect dialog

Changes:

- Hour labels under every column of the hour-of-day chart

Fixes:

- the Watchtower hour-of-day chart drawn as flat lines

## 2.7.4 — 2026-05-26

New features:

- Recovery Contacts page in Web Frontend, Templates with its own appearance controls

Changes:

- Recovery Contacts appearance settings moved out of Forms
- Template pop-up stays open after saving
- More space between paragraphs in announcement cards

Fixes:

- a duplicate unsaved changes bar in template pop-ups
- the Contact us button underlined on hover

## 2.7.3 — 2026-05-25

New features:

- Contact us prompt on the Recovery Contacts page

Changes:

- Phone numbers formatted in the Recovery Contacts directory and PDF

Fixes:

- utility bar buttons wrapping on phones

## 2.7.2 — 2026-05-25

Changes:

- Return to dashboard label on the signed-in admin button
- Spacing and wording of Recovery Contacts email alert settings

## 2.7.1 — 2026-05-25

New features:

- I didn't submit this link in confirmation emails, locking the listing for 7 days
- Flagged requests on the Watchtower Overview with Block IP and Resolve
- Watchtower alert badge for flagged requests
- Flagged and Locked markers on Recovery Contacts listings
- Need help link on the Recovery Contacts form

Changes:

- One update request per listing every 24 hours
- Contact by email through the site on by default
- Contact page link printed in the PDF for site-only listings
- Recovery Contacts form layout and wording

Fixes:

- live search not hiding entries that don't match

## 2.7.0 — 2026-05-25

New features:

- Recovery Contacts directory at /contactlist
- Member self sign-up with chosen public details and admin approval
- Available to sponsor badge
- Contact me button relaying messages privately
- Self-service updates and removals by email confirmation
- Live directory search, including "sponsor"
- PDF download of the directory
- Recovery Contacts activity log
- Pending count badge in the sidebar and entry in the Forms widget
- Email alerts for new entries and removal requests
- Turnstile bot protection on the Recovery Contacts form

## 2.6.1 — 2026-05-24

New features:

- Neobrutal theme
- Neobrutal hero shapes that re-scatter on each page load

Fixes:

- Neobrutal footer location cards turning black on hover

## 2.6.0 — 2026-05-24

New features:

- Modern Dark, Cyberpunk, Sanctuary and Terminal themes
- Themes remember their settings, with Return to last saved state or Reset to default
- Dynamic background for the mega menu
- Separate light and dark mega menu colors
- Mega menu blend slider
- Render dark in light mode switch for the mega menu
- Text Darkmode color on the Design page

Changes:

- Mega menu headings, links and buttons follow its text color
- Frosted-glass header and footer cards in Recovery Blue
- Dark mode colors consistent across themes

## 2.5.0 — 2026-05-22

New features:

- Popups built with the page builder, under Web Frontend, Popups
- Popup size, background, radius, shadow, backdrop and position settings
- Desktop and mobile visibility per popup
- Popups opened from any #name link or after a delay
- Popup preview while disabled

Fixes:

- the home page erroring when no homepage is chosen

## 2.4.0 — 2026-05-21

Changes:

- LIVE meeting badge appears and clears without a page refresh

Fixes:

- Helpline grouped item not collapsing when a meeting goes live after page load

## 2.3.0 — 2026-05-21

New features:

- Caching panel under Web Frontend, Caching
- Browser caching of images, CSS and JavaScript, on by default
- Replaced images shown at once despite caching
- Clear image cache now and Rebuild thumbnails buttons

## 2.2.2 — 2026-05-21

New features:

- Live dot on the sidebar Web button when the public site is live

Changes:

- Consistent drag handles on dashboard widgets
- Larger Watchtower icon and tidier Notifications and Search spacing

Fixes:

- frontend bundles missing page social-share settings and story dates

## 2.2.1 — 2026-05-20

Changes:

- Footer builder works like the page builder, with drag-and-drop rows and columns
- Sticky save bar replaces the Save Footer button

## 2.2.0 — 2026-05-20

New features:

- Preview button in the page editor for unsaved changes
- Preview link for every page, drafts included
- Preview banner, visible to signed-in admins and editors only

## 2.1.35 — 2026-05-20

New features:

- Custom field mapping for every post type in the WordPress importer, saved per site
- Chunked import of WordPress sites over 500 posts, with a progress bar

Changes:

- Sticky Ready to import bar in the importer dry run

## 2.1.34 — 2026-05-20

New features:

- Notifications Center in the sidebar with a live count
- Clear and Clear all for notifications
- Notifications limited to sections the user can act on

## 2.1.33 — 2026-05-20

New features:

- Watchtower 404s tab: missing URLs visitors hit, with trend chart and top list
- Clear log button on Watchtower 404s
- GSR button opens the GSR Summary in a popup
- Go to Announcements button in the GSR Summary popup

Changes:

- Utility-bar groups stay expanded on mobile during a live meeting

## 2.1.32 — 2026-05-20

New features:

- What's New dashboard widget with the latest release note
- Earlier releases list in the What's New widget
- View all release notes button opening Settings, About

## 2.1.31 — 2026-05-20

Changes:

- Templates intro card moved into the page title tooltip
- Template URLs shown as chips beside each name, active template highlighted
- A to Z sort toggle at the far right of the Templates toolbar
- Flat card rows on the Templates page

Fixes:

- the old card layout flashing on Templates page load
- a stray collapse arrow on the Templates page

## 2.1.30 — 2026-05-20

Fixes:

- Customize cards in template modals overflowing into each other

## 2.1.29 — 2026-05-20

New features:

- Image gallery of up to six images on announcement and event posts
- Lightbox for post gallery images
- Multi-select in the File Browser when picking gallery images

Changes:

- Templates page as a sortable list with an Edit modal per template

Fixes:

- the File Browser list-view Select button doing nothing

## 2.1.28 — 2026-05-19

Changes:

- Form-builder field cards expand on a click anywhere on the card
- Announcements and Events list sorted by Posted, newest first, by default
- Posts list remembers your column sort
- Custom Forms sidebar entry renamed Custom Form Submissions
- Manage forms button on Custom Form Submissions
- Dashboard Forms widget shows pending counts only
- Manage form button on Stories, Announcements and Events, and Contact Form lists

Fixes:

- URLs with a trailing slash returning 404

## 2.1.27 — 2026-05-19

New features:

- Accepted file types setting on form file fields

## 2.1.26 — 2026-05-19

Changes:

- Form Preview button follows the form's custom URL
- Default form URL redirects to the custom URL when one is set

## 2.1.25 — 2026-05-19

New features:

- Pending review tab for story submissions on the Stories page
- Public /storyform page
- Field builder on the Announcements/Events, Story and Contact forms
- Custom public URL for each built-in form
- Visibility toggle on custom forms

Changes:

- Submission Form renamed Announcements/Events Form
- Submission Form template renamed Forms Template

## 2.1.24 — 2026-05-19

Changes:

- Save bar on the post edit page replaces the top save buttons
- Summary field renamed GSR Summary
- Event details card hidden while Event is unchecked
- Links card above Event details
- More spacing in the Headline card

## 2.1.23 — 2026-05-19

New features:

- Multiple link buttons on posts, each with label, style and new-tab option

## 2.1.22 — 2026-05-19

New features:

- Auto-archive date and time for announcements

Changes:

- Event website and contact folded into the Event details card
- Queue schedule change saves without closing the meeting modal

Fixes:

- Posted on field blank on older posts

## 2.1.21 — 2026-05-19

New features:

- Scheduled expiry for a meeting's public alert
- Scheduled changes: queue a future meeting schedule with a start date
- Meeting alerts on meetings list cards

Changes:

- Solid amber public meeting alerts

## 2.1.20 — 2026-05-19

New features:

- Choose from File Browser button for a post's featured image

## 2.1.19 — 2026-05-18

New features:

- Pending submission count on the Announcements and Events sidebar entry
- Forms dashboard widget listing every form with counts

Changes:

- Forms widget replaces the Contact Form dashboard widget

## 2.1.18 — 2026-05-18

Changes:

- Form Submissions as cards with submitter name, form and preview
- 12-hour times on the Zoom Accounts calendar
- Add Library in the Intergroup sidebar renamed Add IG Library
- Currently Online no longer counts or lists yourself

## 2.1.17 — 2026-05-18

New features:

- Cloudflare Turnstile on custom forms

## 2.1.16 — 2026-05-18

Changes:

- Off-site backup times shown in the Settings timezone
- Backup schedules run in the Settings timezone
- Idle users kept grayed out in Currently Online for up to an hour
- No users active message in Currently Online

Fixes:

- newly signed-in users sometimes missing from Currently Online

## 2.1.15 — 2026-05-18

Changes:

- Form Submissions moved to the Admin section of the main sidebar

## 2.1.14 — 2026-05-18

Fixes:

- custom form submissions failing with an Internal Server Error

## 2.1.13 — 2026-05-18

Fixes:

- custom form submissions blocked with "CSRF token is missing"

## 2.1.12 — 2026-05-18

New features:

- Custom forms with a drag-and-drop field builder
- Email to recipients on each custom form submission
- Form Submissions inbox, filterable by form
- Submit a story button on /stories linking to any form

Fixes:

- an error opening a custom form's edit page
- text selection in field card textareas
- the Add form button stretching across the card

## 2.1.11 — 2026-05-18

Changes:

- Dropbox backups connect with app key, secret and authorization code
- Legacy token banner on older Dropbox backup targets

Fixes:

- Dropbox backups failing once the access token expired after 4 hours

## 2.1.10 — 2026-05-18

New features:

- Passphrase encryption for full-portal exports
- Generate strong passphrase button on export
- Web Frontend Overview as a customizable widget grid
- Edit button on off-site backup targets
- Light and dark shadow colors for primary and secondary cards

## 2.1.9 — 2026-05-18

Changes:

- Restore bundles upload in chunks, with a progress bar

Fixes:

- restore bundles over 100 MB failing behind Cloudflare

## 2.1.8 — 2026-05-18

Fixes:

- images failing to load right after a restore

## 2.1.7 — 2026-05-18

Changes:

- Turnstile turned off on restore to a different host, with a warning
- Login lockouts cleared on restore to a different host

## 2.1.6 — 2026-05-17

Changes:

- Upload limit raised to 4 GiB
- Spinner during a bundle restore upload

Fixes:

- a blank page when an import exceeded the upload limit
- the page behind the meeting modal showing old values after a save

## 2.1.5 — 2026-05-17

New features:

- Audience choice when sending an email-list update: full list or granular
- Name field on user accounts
- App sidebar auto-hides in the Web Frontend admin, with a toggle

Changes:

- Sidebar stays visible when leaving the Web Frontend admin
- Email-list cards without the side borders
- Email-list page titled Trusted Servants Email List

## 2.1.4 — 2026-05-17

Changes:

- Trusted Servants widget stays on the dashboard after you join
- Edit your own Trusted Servants info from the dashboard widget
- Remove me from the list action in the widget

## 2.1.3 — 2026-05-17

New features:

- Trusted Servants Email List module at /email-list
- Join the Trusted Servants list dashboard widget
- Send an update to the email list, with name personalization
- CSV import for the email list

Changes:

- Watchtower as a pinned sidebar button with attention chips
- Web Frontend sidebar buttons labeled Web and View
- Icons on dashboard widget titles

## 2.1.2 — 2026-05-17

New features:

- Classic, Minimal and Split layouts for /submissionform
- Background, font and size settings for the submission form template

Changes:

- Submission form card follows the Primary card design

## 2.1.1 — 2026-05-17

Changes:

- Settings tabs as single-column cards with icons
- Email tab renamed Domain / Email, with Public Domain moved there
- Access request notification recipient saved with SMTP settings
- New Location button in the Locations card header
- Save sidebar order button in the Sidebar card header
- Release note sections bulleted in Settings, About

Fixes:

- the Locations add button's plus sign invisible

## 2.1.0 — 2026-05-17

New features:

- Off-site backups to FTP, FTPS, SFTP or Dropbox
- Backup setup wizard with connection test, schedule, retention and optional encryption
- Several backup targets, each with its own schedule
- Email to admins when a backup starts failing
- Manage backups modal with status, run history and Run now
- Off-site Backups dashboard widget

Changes:

- Appearance settings laid out as stacked cards
- Busy spinner while a backup runs
- Modals stack instead of replacing each other

Fixes:

- icons flashing oversized when opening the backups modal or settings panels

## 2.0.4 — 2026-05-17

Changes:

- Visible grab handle at the top left of every dashboard widget
- Dashboard widgets fill gaps in a masonry layout

Fixes:

- Recent Deletions, Frontend Visitor Metrics and Contact Form widgets not draggable

## 2.0.3 — 2026-05-16

New features:

- TSP_TRUSTED_PROXIES setting for installs without a reverse proxy

Fixes:

- Watchtower showing the proxy's IP instead of the visitor's
- library item thumbnails broken for public visitors

## 2.0.2 — 2026-05-16

New features:

- Edit post button on public blog posts for signed-in editors
- Admin login block for the mega menu
- Library items from a file, pasted content or an external link, with a summary
- Mobile-only mega menu animation and fade settings

Changes:

- Footer login switches to Dashboard and Logout when signed in
- Logout on the public site returns to the homepage
- Lighter meeting card titles on the homepage
- Add File in libraries renamed Add Item

Fixes:

- hidden fieldsets still showing

## 2.0.1 — 2026-05-16

Changes:

- Pro Tips cards use the Primary card style

Fixes:

- meetings list cards nearly invisible in dark mode

## 2.0.0 — 2026-05-16

New features:

- Watchtower module, replacing User Log, Delete Log and Access Requests
- Watchtower overview with KPI tiles, system health and traffic and failed-login charts
- Alerts for brute-force and concentrated attacks
- IP blocklist with temporary or permanent bans and hit counts
- Failed-login leaderboard with one-click block
- End session on active logins
- Dark-mode page background option in template customization

Changes:

- Visitor Metrics, recycle bin and access requests moved into Watchtower tabs
- Activity feed shows the latest 20 entries with Show more
- Bans, unbans and ended sessions recorded in the activity log
- /user-log, /delete-log and /access-requests replaced by /watchtower

Fixes:

- border color flash on hover in the classic blog detail

## 1.10.5 — 2026-05-15

New features:

- Visual block editor for blog posts
- Section block for grouping blocks with spacing
- Container width on the blog detail page
- Preview of draft and archived posts on their public URL
- Image library picker for blog images and featured images
- View on Frontend button in the blog editor
- Related and Categories widgets can be hidden on the classic blog detail

Changes:

- Blog editor with a metadata sidebar
- Categories and tags as checklists with inline add
- Author picked from the Intergroup roster
- Title fills in the URL as you type
- Hyperlist always dark, with weeks starting on Sunday
- Classic blog detail and blog list cards use the primary card style
- Featured image leads the classic blog post card
- Blog comments removed
- Author bio field removed from the blog editor
- Hyperlist search hint shortened

Fixes:

- Enter in a blog field publishing the post
- the template background ignored on the classic blog detail
- mesh background randomizing ignored on the classic blog detail

## 1.10.4 — 2026-05-15

Fixes:

- visitor metrics counting hits while the public site is off

## 1.10.3 — 2026-05-15

Changes:

- Scanner probes like /.env and /wp-admin get a bare 404
- SVG uploads sanitized everywhere
- Installer generates a random admin password
- Production refuses to start without an admin password
- Cross-origin isolation headers on every response
- Failed credential decryption logged

Fixes:

- open redirects through the Referer header

## 1.10.2 — 2026-05-14

New features:

- Per-page link previews for meetings, events, announcements, stories and blog posts
- Link preview title, description and image per content page
- iOS Home Screen icon and name for the admin and the public site
- View on Frontend button in the announcement and event editor
- Linked titles in the GSR Summary

Changes:

- Event and announcement detail cards use the Primary card style
- Announcement card titles are the link, View details removed
- Featured images in the Events Magazine More events grid, at most 3 per row

Fixes:

- missing mobile gutter on homepage Meetings and Events blocks

## 1.10.1 — 2026-05-14

New features:

- Release notes pane in Settings, About
- Location name and address in the Sidebar meetings list
- Custom links in the Sidebar meetings list rail
- Duplicate button for announcements and events
- Post URL updates live as you type the title

Changes:

- Desktop container gutter on by default
- View on Frontend on meeting detail whenever the frontend is on
- File descriptions removed from the meeting Files & Readings panel
- Post URL follows the title when the title changes
- First publish stamps the current time
- Renamed drafts no longer create URL redirects
- Frontend export no longer includes posts
- Meeting descriptions capped at 75% width on wide screens
- Relative paths accepted in event website URLs
- Announcements and events lists sorted newest first
- Shorter GSR Summary subheading

Fixes:

- homepage Meetings and Events cards crushed by double padding
- Publish and Move to Drafts losing unsaved edits
- auto-stamped publish times ignoring the site timezone
- homepage side padding reset by a frontend export round-trip

## 1.10.0 — 2026-05-14

New features:

- Surface Darkmode token for the dark-mode page background
- Border and hover tokens for Primary and Secondary buttons, with live previews
- Hover border tokens for cards
- Container padding tokens for desktop and mobile
- Inline buttons on Features cards, with an optional section button
- Icon picker and design-token colors in hero button rows
- Custom links in the meetings sidebar

Changes:

- Button and card tokens in two-column views with previews

Fixes:

- the mobile gutter missing site-wide

## 1.9.1 — May 2026

Fixes:

- page spacing and the homepage choice lost when restoring a frontend bundle

## 1.9.0 — May 2026

New features:

- Any Page can be the homepage
- Dark-mode heading gradient and subheading color in the hero block
- Per-side border widths, hover border width and hover effects on containers
- Features, FAQ, Meetings list and Upcoming Events blocks for any page

Changes:

- Legacy homepage admin retired

## 1.8.6 – 1.8.8 — May 2026

New features:

- Library import wizard
- Public submission form for events and announcements at /submissionform

Changes:

- Frontend export covers layouts, fonts, icons, hero buttons, media and settings

## 1.8.5 — May 2026

Fixes:

- logout loop with two instances on one hostname

## 1.8.4 — April 2026

New features:

- Public Literature Library at /library
- Printable meeting schedule at /printlist and /printlist.pdf
- Plain-HTML accessible meeting index at /hyperlist
- Site-wide search with Cmd/Ctrl+K
- Past events archive at /events/archive

## 1.8.3 — April 2026

New features:

- Pro Tips accordion on /meetings
- Statement of Inclusion block
- Notes and website on meeting locations
- Footer meeting-locations block
- Default appearance setting: light, dark or system

Changes:

- Split address fields on meeting locations
- Meeting locations open to frontend editors
- Recovery Blue primary buttons styled like the Zoom button

Fixes:

- several dark-mode display issues

## 1.8.0 – 1.8.2 — March 2026

New features:

- Sidebar, Directory and Week board templates for /meetings
- Live Meetings Bar, replacing the Top Alert Bar
- Extended Content section on meetings
- Edit shortcut on public meeting and event pages
- Click-to-copy chips
- Timezone tab in Settings
- Powered by Trusted Servants Pro footer block

## 1.7.0 – 1.7.17 — February 2026

New features:

- Announcements & Events module, with an Upcoming Events block and an /events page
- Design tokens for the public site
- Custom font and icon libraries
- Reusable detail-page templates
- Customizable public 404 page and a new admin 404 page
- Two-panel split block for the homepage
- Per-module role permissions and a Frontend editor role
- Frontend favicon, Open Graph and meta tags
- Daily database snapshots in /data/snapshots, with retention

Changes:

- Recovery Blue theme name, with per-template appearance overrides

## 1.6.0 – 1.6.2 — January 2026

New features:

- Web Frontend module: a public site built from swappable templates
- Navigation editor with mega menus, search and an admin preview banner
- Alert bars
- Frontend bundle export and import
- Web Frontend pane in Settings
- Update banner for same-version redeploys
- Separate switches for enabling the frontend and making it public
- Pasted fonts for the public site

## 1.4.0 — December 2025

New features:

- Preview before selecting in the File Browser picker
- Sort controls in the File Browser picker
- File Browser picker view kept across a refresh

Changes:

- File Browser picker uses the File Browser's table layout
- Larger Upload new and File Browser buttons

Fixes:

- picker search and sorting leaving picker mode

## 1.3.7 – 1.3.13 — November 2025

New features:

- Readings from pasted content, with a Markdown editor and preview
- Paper-styled lightbox for pasted readings
- PDF download of pasted readings
- TEXT badge for pasted readings
- Per-username login lockouts, shown to admins
- Create a user from an access request in one click
- Access Requests widget toggle in Customize Dashboard

Changes:

- CSRF protection, secure cookies, security headers and XSS hardening
- Login brute-force protection
- Redesigned Access Requests widget
- Sidebar footer always visible on mobile
- Sidebar logo and Open Graph image hidden from the File Browser
- Replaced logo and Open Graph files deleted once nothing uses them

## 1.3.0 – 1.3.6 — October 2025

New features:

- Drag-and-drop dashboard with per-user widgets
- Open Graph link previews
- Server Stats and Server Metrics widgets
- First-run setup wizard
- Guided tour for viewers and editors
- File Browser lightbox for images and PDFs
- Legacy WordPress URLs redirected

Changes:

- Open source under AGPLv3, credited on the About page
- SVG icons throughout
- Light mode by default on fresh installs

## 1.2 — September 2025

New features:

- Sidebar logo on the login screen

Changes:

- Renamed to Trusted Servants Pro
- Third-party branding removed

## 1.1 — September 2025

New features:

- Cloudflare Turnstile on login and access requests
- Unattended installer mode

Changes:

- Stricter cache headers on sign-in pages

## 1.0 — August 2025

New features:

- Meetings, Libraries and Readings, File Browser
- Copy Link buttons
- Admin, editor and viewer roles with Request Access
- Encrypted Zoom account storage and Zoom Tech Training
- Intergroup info
- Themes: light, dark, neobrutal, cyberpunk, solarpunk
- 3D login transition
- Email over SMTP
- Data export and import
- Configurable session length
- Mobile layouts for every view
