"use strict";

const contact = { type: "html", html: `<address><strong>Contact IELTSX</strong><br>Email: <a href="mailto:support@ieltsx.org">support@ieltsx.org</a><br>Website: <a href="https://ieltsx.org">https://ieltsx.org</a></address>` };
const privacyContact = { type: "html", html: `<address><strong>For privacy questions or requests:</strong><br>Email: <a href="mailto:support@ieltsx.org">support@ieltsx.org</a><br>Website: <a href="https://ieltsx.org">https://ieltsx.org</a></address>` };
const refundContact = { type: "html", html: `<address><strong>For payment or refund questions:</strong><br>Email: <a href="mailto:support@ieltsx.org">support@ieltsx.org</a><br>Website: <a href="https://ieltsx.org">https://ieltsx.org</a></address>` };

const terms = {
    slug: "terms",
    title: "Terms of Service",
    description: "Terms governing access to IELTSX accounts, subscriptions, practice tools, and educational services.",
    sections: [
        { title: "Acceptance of these Terms", blocks: [
            `These Terms of Service govern your access to and use of IELTSX, including its website, user accounts, subscriptions, practice tests, mock examinations, educational tools, AI-assisted features, and related services.`,
            `By accessing or using IELTSX, creating an account, or purchasing a subscription, you agree to these Terms, the <a href="/privacy">Privacy Policy</a>, and the <a href="/refund-policy">Refund Policy</a>.`,
            `If you do not agree, you must not use IELTSX.`
        ]},
        { title: "Eligibility", blocks: [
            `You must be legally capable of entering into an agreement under the laws that apply to you.`,
            `Users who have not reached the age of legal majority in their country must use IELTSX only with the permission and supervision of a parent or legal guardian.`,
            `IELTSX is not intended for children under 13.`
        ]},
        { title: "Description of IELTSX", blocks: [
            `IELTSX is an independent online English-language and IELTS preparation platform.`,
            `The service may include:`,
            { type: "list", items: [`listening, reading, writing, and speaking practice;`, `mock examinations;`, `automated and AI-assisted feedback;`, `estimated band scores;`, `vocabulary and study tools;`, `performance history;`, `Premium educational features.`] },
            `IELTSX does not administer official IELTS examinations and does not issue official IELTS scores, certificates, or qualifications.`,
            `Any score, correction, evaluation, prediction, or feedback produced by IELTSX is provided for educational purposes only. Results may differ from those awarded in an official examination.`,
            `Users remain responsible for confirming important examination, immigration, university, employment, or admissions information with the appropriate official organization.`
        ]},
        { title: "Independent platform notice", blocks: [
            `IELTSX is an independent preparation platform. It is not affiliated with, endorsed by, sponsored by, or operated by the British Council, IDP IELTS, or Cambridge University Press &amp; Assessment.`,
            `IELTS and related trademarks belong to their respective owners.`
        ]},
        { title: "User accounts", blocks: [
            `You must provide accurate information when creating and maintaining an account.`,
            `You are responsible for protecting your password, authentication method, and account access.`,
            `You must notify IELTSX through <a href="mailto:support@ieltsx.org">support@ieltsx.org</a> if you believe that your account has been accessed without authorization.`,
            `Unless expressly permitted, each account is intended for one individual user.`,
            `You must not:`,
            { type: "list", items: [`share, rent, sell, or transfer an account;`, `impersonate another person;`, `create accounts through automated methods;`, `use another person's account without permission;`, `provide false account information.`] }
        ]},
        { title: "Subscription plans", blocks: [
            `IELTSX currently offers the following automatically renewing plans:`,
            { type: "list", items: [`Starter: USD $5, billed every month;`, `Accelerator: USD $12, billed every three months;`, `Mastery: USD $50, billed every year.`] },
            `The exact price, currency, taxes, billing interval, and renewal date shown during Paddle Checkout control the purchase.`,
            `Localized prices may differ depending on the customer's location, taxes, currency, or payment method.`,
            `Subscriptions automatically renew until canceled.`,
            `By completing the purchase, you authorize Paddle to charge the selected payment method at the beginning of each billing period.`
        ]},
        { title: "Payments", blocks: [
            `Payments are processed by Paddle, which acts as the Merchant of Record for transactions completed through Paddle Checkout.`,
            `Paddle may handle:`,
            { type: "list", items: [`payment collection;`, `applicable taxes;`, `receipts and invoices;`, `recurring billing;`, `payment-method management;`, `subscription cancellation;`, `approved refunds;`, `fraud and payment-security checks.`] },
            `IELTSX does not receive or store complete payment-card numbers, CVV codes, or card PINs.`,
            `Failed or reversed payments may result in restricted Premium access, suspension, or cancellation.`
        ]},
        { title: "Automatic renewal", blocks: [
            `Each paid plan renews automatically using its selected billing interval unless it is canceled before the next renewal date.`,
            `A monthly plan renews monthly, a three-month plan renews every three months, and an annual plan renews annually.`,
            `The renewal date and amount are shown during checkout and may also appear in the Paddle receipt or subscription-management page.`
        ]},
        { title: "Cancellation", blocks: [
            `You may cancel a subscription using a Paddle receipt, Paddle's subscription-management tools, an available Manage Subscription option, or by contacting <a href="mailto:support@ieltsx.org">support@ieltsx.org</a>.`,
            `Cancellation normally prevents the next automatic renewal.`,
            `Unless applicable law requires otherwise, Premium access remains available until the end of the billing period that has already been paid.`,
            `Canceling a subscription does not automatically refund a completed payment.`
        ]},
        { title: "Refunds", blocks: [
            `Completed digital-subscription payments are generally final and non-refundable.`,
            `Exceptions apply only where:`,
            { type: "list", items: [`a refund is required by applicable law;`, `Paddle approves a refund;`, `the <a href="/refund-policy">Refund Policy</a> expressly provides otherwise.`] },
            `The complete rules are available at <a href="/refund-policy">/refund-policy</a>.`
        ]},
        { title: "Acceptable use", blocks: [
            `You must not use IELTSX to:`,
            { type: "list", items: [`violate any law or regulation;`, `cheat during an official examination;`, `present IELTSX results as official IELTS results;`, `copy, sell, publish, or redistribute paid content without permission;`, `scrape, crawl, or bulk-download the service;`, `bypass subscription, authentication, or access controls;`, `attack, disrupt, reverse engineer, or damage the platform;`, `upload malicious code;`, `interfere with another user's account;`, `submit content that infringes another person's rights;`, `misuse AI-assisted features for unlawful purposes.`] }
        ]},
        { title: "User submissions", blocks: [
            `You retain ownership of writing, answers, audio recordings, and other content that you submit to IELTSX.`,
            `You give IELTSX a limited permission to store, process, analyze, transcribe, and display that content only as reasonably necessary to:`,
            { type: "list", items: [`provide the requested features;`, `generate educational feedback;`, `maintain progress history;`, `secure and improve the service;`, `investigate technical or security problems.`] },
            `IELTSX does not claim ownership of your original submissions.`
        ]},
        { title: "Intellectual property", blocks: [
            `The IELTSX software, interface, branding, original educational content, design, explanations, and platform features are protected by applicable intellectual-property laws.`,
            `You receive a limited, personal, revocable, non-exclusive, and non-transferable right to use IELTSX for private educational purposes.`,
            `No part of IELTSX may be reproduced, resold, or commercially exploited without permission.`
        ]},
        { title: "AI-assisted features", blocks: [
            `IELTSX may use automated or AI-assisted systems to evaluate writing, speech, answers, pronunciation, grammar, vocabulary, and performance.`,
            `AI-generated content may contain errors, omissions, inconsistent scoring, or unsuitable suggestions.`,
            `AI feedback is not:`,
            { type: "list", items: [`an official IELTS assessment;`, `a human examiner's decision;`, `professional legal or immigration advice;`, `a guaranteed prediction of an examination result.`] },
            `You should review important feedback independently.`
        ]},
        { title: "Service availability", blocks: [
            `IELTSX may update, replace, suspend, or remove features.`,
            `Reasonable efforts will be made to keep the service available, but uninterrupted, secure, or error-free operation is not guaranteed.`,
            `Temporary interruptions may occur because of maintenance, security updates, infrastructure problems, third-party failures, or circumstances outside IELTSX's reasonable control.`
        ]},
        { title: "Account suspension and termination", blocks: [
            `An account may be restricted or suspended where reasonably necessary because of:`,
            { type: "list", items: [`fraud or suspected fraud;`, `non-payment;`, `account sharing;`, `security risks;`, `unlawful activity;`, `copyright infringement;`, `abuse of the service;`, `a serious or repeated breach of these Terms.`] },
            `Where reasonable, the user may be given an opportunity to contact support.`
        ]},
        { title: "Third-party services", blocks: [
            `IELTSX may depend on trusted third-party service providers for functions such as authentication, hosting, data storage, artificial intelligence, email delivery, security, and payment processing.`,
            `Those services may be governed by their own terms and privacy policies.`,
            `IELTSX is not responsible for third-party services that are outside its reasonable control.`
        ]},
        { title: "Disclaimers", blocks: [
            `IELTSX is provided on an "as available" basis to the maximum extent permitted by law.`,
            `IELTSX does not guarantee:`,
            { type: "list", items: [`a particular IELTS score;`, `admission to a university;`, `visa or immigration approval;`, `employment;`, `acceptance by an educational institution;`, `uninterrupted access;`, `completely accurate automated feedback.`] },
            `Nothing in these Terms removes consumer rights or warranties that cannot lawfully be excluded.`
        ]},
        { title: "Limitation of liability", blocks: [
            `To the maximum extent permitted by law, IELTSX is not responsible for indirect, incidental, or consequential losses resulting from use of, or inability to use, the service.`,
            `IELTSX is not responsible for decisions made solely in reliance on estimated scores or automated feedback.`,
            `Nothing in these Terms excludes liability that cannot lawfully be excluded, including liability for fraud or intentional misconduct.`
        ]},
        { title: "Changes to these Terms", blocks: [
            `These Terms may be updated to reflect changes to the service, legal requirements, security practices, or payment arrangements.`,
            `The Last updated date will be changed when the Terms are revised.`,
            `Material changes may also be communicated through the website, account interface, or email where appropriate.`
        ]},
        { title: "Contact", blocks: [contact] }
    ]
};

const privacy = {
    slug: "privacy",
    title: "Privacy Policy",
    description: "How IELTSX collects, uses, stores, shares, and protects personal information.",
    sections: [
        { title: "Introduction", blocks: [
            `This Privacy Policy explains how IELTSX collects, uses, stores, and protects personal information when you use the IELTSX website, accounts, practice tools, Premium subscriptions, and related services.`,
            `By using IELTSX, you acknowledge the practices described in this Policy.`
        ]},
        { title: "Information IELTSX may collect", blocks: [
            { type: "html", html: `<h3>Account information</h3>` },
            { type: "list", items: [`name;`, `email address;`, `authentication identifiers;`, `profile information that you choose to provide;`, `account settings and preferences.`] },
            { type: "html", html: `<h3>Learning information</h3>` },
            { type: "list", items: [`test answers;`, `writing submissions;`, `speaking recordings;`, `audio and transcripts;`, `scores and estimated band results;`, `corrections and feedback;`, `test history;`, `vocabulary records;`, `mistakes and progress information;`, `saved notes and study activity.`] },
            { type: "html", html: `<h3>Subscription information</h3>` },
            { type: "list", items: [`selected plan;`, `subscription status;`, `renewal and expiration dates;`, `Paddle customer, transaction, and subscription identifiers;`, `payment status.`] },
            `IELTSX does not receive or store complete card numbers, CVV codes, or card PINs. Payment-card information is processed by Paddle.`,
            { type: "html", html: `<h3>Support information</h3>` },
            `IELTSX may collect messages, attachments, and other information that you send when requesting support.`,
            { type: "html", html: `<h3>Technical information</h3>` },
            `IELTSX and its service providers may automatically collect:`,
            { type: "list", items: [`IP address;`, `browser and device information;`, `operating system;`, `requested pages;`, `timestamps;`, `error logs;`, `authentication and security events;`, `essential cookie information.`] }
        ]},
        { title: "How information is collected", blocks: [
            `Information may be collected:`,
            { type: "list", items: [`directly from you;`, `when you create or update an account;`, `when you complete a test or submit content;`, `when you use speaking or writing features;`, `from an authentication provider;`, `from Paddle after a subscription event;`, `automatically through normal website and server operation.`] }
        ]},
        { title: "How information is used", blocks: [
            `IELTSX may use information to:`,
            { type: "list", items: [`create and authenticate accounts;`, `provide tests and educational tools;`, `generate AI-assisted feedback;`, `save scores and progress;`, `provide Premium access;`, `process and confirm subscriptions;`, `respond to support requests;`, `protect accounts and prevent fraud;`, `investigate errors and security incidents;`, `improve reliability and performance;`, `send essential service messages;`, `comply with legal obligations;`, `enforce the Terms of Service.`] },
            `Optional promotional messages will be sent only where permission or another lawful basis exists.`
        ]},
        { title: "Writing, audio, and AI processing", blocks: [
            `When you submit writing, answers, audio, or recordings for analysis, the content may be processed by automated systems and trusted service providers to provide transcription, scoring, correction, or educational feedback.`,
            `Do not include unnecessary sensitive personal information in practice answers or recordings.`,
            `Automated scores are educational estimates. They are not used by IELTSX to make official legal, employment, immigration, credit, or university admissions decisions.`
        ]},
        { title: "Payment processing", blocks: [
            `Paddle processes payments made through Paddle Checkout.`,
            `Paddle may process information required for:`,
            { type: "list", items: [`collecting payment;`, `handling taxes;`, `issuing receipts;`, `managing subscriptions;`, `detecting payment fraud;`, `handling cancellations;`, `evaluating refund requests.`] },
            `Paddle handles payment information under its own buyer terms and privacy documentation.`
        ]},
        { title: "Sharing of information", blocks: [
            `IELTSX does not sell personal information.`,
            `Information may be shared only where reasonably necessary with:`,
            { type: "list", items: [`payment processors;`, `authentication providers;`, `hosting and database providers;`, `AI and transcription providers;`, `email and support providers;`, `security and monitoring providers;`, `professional advisers;`, `authorities where disclosure is legally required;`, `a legitimate successor following a merger, restructuring, or transfer.`] },
            `Service providers are expected to process information only for the services they provide and subject to applicable contractual and legal requirements.`
        ]},
        { title: "International processing", blocks: [
            `Some service providers may process information in countries other than the country where you live.`,
            `Where required, reasonable contractual, technical, and organizational measures are used to protect information during international processing.`
        ]},
        { title: "Data retention", blocks: [
            `Account and learning information may be retained while your account is active and for a reasonable period afterward where necessary to provide the service, resolve disputes, maintain security, or comply with legal requirements.`,
            `Payment, tax, fraud-prevention, and transaction records may be retained for longer periods where required by Paddle or applicable law.`,
            `Deleted information may remain temporarily in secure backups before normal backup deletion cycles are completed.`
        ]},
        { title: "Data security", blocks: [
            `IELTSX uses reasonable administrative, technical, and organizational measures intended to protect personal information.`,
            `However, no internet service, database, or transmission method can be guaranteed to be completely secure.`,
            `You are responsible for keeping your account credentials confidential.`
        ]},
        { title: "Your privacy rights", blocks: [
            `Depending on the laws that apply to you, you may have the right to request:`,
            { type: "list", items: [`access to your information;`, `correction of inaccurate information;`, `deletion;`, `restriction of processing;`, `objection to certain processing;`, `a portable copy of certain information;`, `withdrawal of consent;`, `closure of your account.`] },
            `Requests can be sent to <a href="mailto:support@ieltsx.org">support@ieltsx.org</a>.`,
            `IELTSX may need to verify your identity before completing a request.`,
            `Some information may be retained where necessary for security, fraud prevention, legal compliance, transaction records, or the establishment or defense of legal claims.`
        ]},
        { title: "Account deletion", blocks: [
            `You may request account deletion by contacting <a href="mailto:support@ieltsx.org">support@ieltsx.org</a> or by using an account-deletion feature where available.`,
            `Deleting an account may permanently remove access to learning history, saved results, and Premium features.`,
            `Certain billing, security, and legal records may be retained where required.`
        ]},
        { title: "Cookies", blocks: [
            `IELTSX may use essential cookies or similar technologies for:`,
            { type: "list", items: [`authentication;`, `session management;`, `security;`, `account preferences;`, `basic service operation.`] },
            `Where non-essential analytics or marketing technologies are introduced, appropriate notice or consent controls will be provided where required.`,
            `Blocking essential cookies may prevent parts of IELTSX from working correctly.`
        ]},
        { title: "Children's privacy", blocks: [
            `IELTSX is not intended for children under 13.`,
            `Users who have not reached the legal age of majority in their country should use IELTSX only with permission from a parent or legal guardian.`,
            `A parent or guardian who believes that a child has provided information inappropriately may contact <a href="mailto:support@ieltsx.org">support@ieltsx.org</a>.`
        ]},
        { title: "External links", blocks: [
            `IELTSX may contain links to third-party websites.`,
            `IELTSX is not responsible for the privacy practices, security, or content of external websites.`,
            `You should review their privacy policies separately.`
        ]},
        { title: "Changes to this Policy", blocks: [
            `This Privacy Policy may be updated when the service, technology, or legal requirements change.`,
            `The Last updated date will be revised when changes are made.`,
            `Material changes may be announced through the website, account interface, or email where appropriate.`
        ]},
        { title: "Contact", blocks: [privacyContact] }
    ]
};

const refundPolicy = {
    slug: "refund-policy",
    title: "Refund Policy",
    description: "Refund, cancellation, and review rules for IELTSX subscriptions purchased through Paddle Checkout.",
    sections: [
        { title: "Scope", blocks: [
            `This Refund Policy applies to IELTSX subscriptions purchased through Paddle Checkout.`,
            `By purchasing a subscription, you agree to this Policy, the <a href="/terms">Terms of Service</a>, and the applicable terms displayed during checkout.`
        ]},
        { title: "General non-refundable rule", blocks: [
            { type: "notice", html: `<strong>Except where required by applicable law, approved by Paddle, or expressly provided in this Policy, all completed IELTSX digital-subscription payments are final, non-refundable, and non-exchangeable.</strong>` },
            `Access to Premium digital features may begin immediately after successful payment.`
        ]},
        { title: "Paddle payments", blocks: [
            `Paddle acts as the Merchant of Record for payments completed through Paddle Checkout.`,
            `Paddle handles payment collection, taxes, receipts, recurring billing, subscription management, and approved refunds.`,
            `Any approved refund is processed through Paddle rather than paid directly by IELTSX.`
        ]},
        { title: "Mandatory consumer rights", blocks: [
            `Nothing in this Policy removes refund, cancellation, withdrawal, or other consumer rights that cannot legally be excluded.`,
            `Where the laws of your country provide stronger mandatory rights, those rights apply.`,
            `The availability and scope of statutory rights may depend on your country, the type of purchase, when digital access began, and any consent given during checkout.`
        ]},
        { title: "Cases that may be reviewed", blocks: [
            `A refund request may be reviewed where:`,
            { type: "list", items: [`successful payment was completed but Premium access was not provided;`, `a duplicate payment was charged for the same subscription period;`, `a persistent material technical defect prevented meaningful access;`, `a payment was unauthorized, subject to verification;`, `a refund is required by applicable law;`, `Paddle determines that a refund should be issued.`] },
            `IELTSX may first attempt to correct an access or technical problem.`,
            `Submitting a request does not guarantee approval.`
        ]},
        { title: "Cases normally not eligible for a refund", blocks: [
            `Subject to mandatory consumer rights, refunds are normally not provided solely because:`,
            { type: "list", items: [`you changed your mind;`, `you did not use the subscription;`, `you forgot to cancel before renewal;`, `you no longer need the service;`, `you purchased the wrong plan;`, `an estimated score differed from an official IELTS score;`, `you expected a guaranteed examination result;`, `your internet connection or unsupported device caused the problem;`, `your account was suspended for fraud, abuse, account sharing, or a serious breach of the Terms.`] }
        ]},
        { title: "Cancellation is not a refund", blocks: [
            `Canceling a subscription prevents future automatic renewals.`,
            `Cancellation does not normally reverse or refund a payment that has already been completed.`,
            `Unless applicable law requires otherwise, access continues until the end of the billing period already paid for.`
        ]},
        { title: "Renewal payments", blocks: [
            `Subscriptions renew automatically until canceled.`,
            `You are responsible for canceling before the next renewal date if you do not want the subscription to renew.`,
            `Forgetting to cancel before renewal does not automatically create a right to a refund.`
        ]},
        { title: "How to request review", blocks: [
            `To request assistance or a refund review, use one of the following:`,
            { type: "list", items: [`the Manage Subscription or View Receipt link in the Paddle email;`, `Paddle's buyer-support service;`, `email <a href="mailto:support@ieltsx.org">support@ieltsx.org</a>.`] },
            `Include:`,
            { type: "list", items: [`the email connected to the IELTSX account;`, `the Paddle transaction or receipt number;`, `the purchase date;`, `the subscription plan;`, `a clear explanation of the issue.`] },
            `Do not send complete card information, CVV codes, passwords, or PINs.`
        ]},
        { title: "Review process", blocks: [
            `IELTSX may review whether access was delivered and whether a technical problem occurred.`,
            `Paddle may separately review payment, fraud, consumer-right, and transaction information.`,
            `A request may be accepted or rejected based on the facts, Paddle's policies, and applicable law.`
        ]},
        { title: "Approved refunds", blocks: [
            `Where a refund is approved, Paddle normally returns it to the original payment method where possible.`,
            `The time required for the funds to appear depends on Paddle, the payment method, the card issuer, and the customer's financial institution.`,
            `Premium access connected to a refunded purchase may be terminated.`
        ]},
        { title: "Chargebacks", blocks: [
            `Customers are encouraged to contact IELTSX or Paddle before filing a chargeback so that the issue can be investigated.`,
            `Legitimate chargeback rights are not restricted.`,
            `Fraudulent or abusive chargebacks may result in temporary account restriction while the matter is investigated.`
        ]},
        { title: "Changes to this Policy", blocks: [
            `This Policy may be updated to reflect changes to the service, payment arrangements, Paddle requirements, or applicable law.`,
            `Changes do not remove mandatory rights that applied when a transaction was completed.`
        ]},
        { title: "Contact", blocks: [refundContact] }
    ]
};

module.exports = { legalPages: { terms, privacy, "refund-policy": refundPolicy } };
