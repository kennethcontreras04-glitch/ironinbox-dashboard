

Targets from the project charter: **detection ≥ 90%** of suspicious emails, **false positives < 10%** of normal emails.

## How to rerun

```
npm --prefix api run eval                      # both sets, default sensitivity (40)
npm --prefix api run eval -- --set scoring     # held-out set only
npm --prefix api run eval -- --verbose         # every email with its score and signals
npm --prefix api run eval -- --threshold 50    # a different sensitivity
```

- `emails-tuning.mjs`: 35 emails (20 normal, 15 suspicious). Used to adjust rules.
- `emails-scoring.mjs`: 35 different emails (20 normal, 15 suspicious). **Held out**: written before the rule changes and never used to adjust them. Do not edit it to improve results; add a new set instead.
- Every email goes through the real Gmail/Outlook parsers and the app's default keyword list.

## Results (November 16, 2026)

Detection = suspicious emails flagged. False positives = normal emails flagged.

### Held-out scoring set (the number to report)

| Version | Sensitivity | Detection | False positives | Targets |
|---|---|---|---|---|
| Before Carlos's change (`71a8e52^`) | 50 | 53.3% (8/15) | 5.0% (1/20) | Detection not met |
| **Reworked detection** | **40 (new default)** | **93.3% (14/15)** | **0.0% (0/20)** | **Both met** |
| Reworked detection | 50 (old default) | 86.7% (13/15) | 0.0% (0/20) | Detection not met |

### Tuning set

| Version | Sensitivity | Detection | False positives |
|---|---|---|---|
| Before Carlos's change | 50 | 40.0% (6/15) | 0.0% (0/20) |
| Reworked detection | 40 | 100% (15/15) | 0.0% (0/20) |

At sensitivity 40, the old rules had a 15% false-positive rate on the tuning set and 5% on the scoring set; the reworked rules have 0% on both.

Keyword matches are reported separately by `npm --prefix api run eval`. With the new default keywords: 1/20 normal tuning emails and 2/20 normal scoring emails are listed as "Keyword match" only. These are not threats and are not part of the false-positive rate.

## What changed and why

The rework separates normal and suspicious scores instead of just lowering them:

- **Wording alone can't make an email a threat.** Built-in phrase points are capped at 30 (18 for authenticated senders with no technical warning signs).
- **Monitored keywords are separate from risk.** A keyword match adds 0 to the risk score. If "Flag the email" is on, the email still goes to Flagged Emails, tagged **Keyword match**, but it is not counted as a threat on the dashboard or in these rates. Short keywords match whole words only ("won" no longer matches "wonderful").
- **New default keywords** are phishing phrases (verify your account, confirm your identity, password expires, account suspended, gift card, wire transfer, bank details, direct deposit, claim your prize, unusual sign-in). The old defaults (account, confirm, security…) appeared in 25 of 40 normal test emails; the new ones appear in 3 of 40. Existing users keep their saved list and can switch with **Use recommended keywords** on the Keyword Monitoring page.
- **Forwarding noise ignored.** SPF/DKIM failures only count when DMARC does not pass, so mailing-list forwards are no longer flagged (one went from 86 to 18).
- **Click-tracking recognised.** Known redirect services, the sender's own domain and tracking subdomains (`click.`, `links.`) on authenticated mail are not counted as deceptive links. A non-brand domain shown in link text but opening somewhere else *is* still caught.
- **Personal webmail never earns brand trust.** Previously `gmail.com` counted as a trusted Google domain, so a CEO gift-card scam from Gmail got −15. Requests for money or credentials from personal webmail (or with replies diverted to it) are now scored as business-email compromise.
- **Reply-To mismatches** only count when replies go to personal webmail or a lookalike, or when the sender is unauthenticated (help desks and lists do this legitimately).
- **Stronger technical evidence.** Raw-IP links +30, a sign-in prompt combined with a deceptive link +15, web-page or macro attachments +40, executables +40, archives +10/25, Gmail's spam verdict +35.
- **More brands and their real domains**, from public brand-phishing reports (adds DHL, FedEx, USPS, DocuSign, Dropbox, Adobe, WhatsApp; adds Google Groups, SharePoint, AWS, etc. as legitimate).
- **Default sensitivity 40.** On the scoring set, normal emails now score ≤ 18 and every suspicious email except `s-s13` scores ≥ 48. 40 sits in that gap; because wording is capped at 30, an email needs at least one technical warning sign to be flagged.

## Known limitations

- **Missed:** `s-s13`, an attacker-owned domain that passes DMARC with a plain "view invoice" link and no lure wording. Nothing in the email itself distinguishes it from a real invoice; catching it needs domain-age or reputation data, which IronInbox doesn't have.
- **Both sets were written by the same person who tuned the rules**, so these numbers are optimistic. The charter's real measure is the controlled emails sent between the project accounts; repeat this retest with those and record the results here.
- Existing users keep their saved sensitivity. Anyone still at 50 should choose **Balanced (40)** in Settings.
