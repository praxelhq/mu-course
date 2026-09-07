-- AddTable
BEGIN;

CREATE TABLE "UserEmailAlias" (
    "email" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserEmailAlias_pkey" PRIMARY KEY ("email")
);

CREATE INDEX "UserEmailAlias_userId_idx" ON "UserEmailAlias"("userId");

ALTER TABLE "UserEmailAlias" ADD CONSTRAINT "UserEmailAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserClerkIdentity" (
    "clerkUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserClerkIdentity_pkey" PRIMARY KEY ("clerkUserId")
);

CREATE INDEX "UserClerkIdentity_userId_idx" ON "UserClerkIdentity"("userId");

ALTER TABLE "UserClerkIdentity" ADD CONSTRAINT "UserClerkIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Emails are authentication credentials. Keep one case-insensitive owner
-- across the canonical and alias namespaces, including future roster writes.
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (lower(email));
CREATE UNIQUE INDEX "UserEmailAlias_email_lower_key" ON "UserEmailAlias" (lower(email));

CREATE FUNCTION enforce_user_email_identity_owner() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'User' THEN
    IF EXISTS (
      SELECT 1 FROM "UserEmailAlias" a
      WHERE lower(a.email) = lower(NEW.email) AND a."userId" <> NEW.id
    ) THEN
      RAISE EXCEPTION 'email identity is owned by another LMS user';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM "User" u
      WHERE lower(u.email) = lower(NEW.email) AND u.id <> NEW."userId"
    ) THEN
      RAISE EXCEPTION 'email identity is owned by another LMS user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_email_identity_owner"
BEFORE INSERT OR UPDATE OF email ON "User"
FOR EACH ROW EXECUTE FUNCTION enforce_user_email_identity_owner();

CREATE TRIGGER "UserEmailAlias_email_identity_owner"
BEFORE INSERT OR UPDATE OF email, "userId" ON "UserEmailAlias"
FOR EACH ROW EXECUTE FUNCTION enforce_user_email_identity_owner();

-- Preserve every existing Clerk link in the many-to-one identity map.
INSERT INTO "UserClerkIdentity" ("clerkUserId", "userId")
SELECT "clerkUserId", id FROM "User" WHERE "clerkUserId" IS NOT NULL;

-- Section F: preserve each student's personal email as the canonical address
-- and add the supplied Masters' Union address as an alternate login. Names are
-- matched only inside Section F; the one source row without an email is left
-- unchanged and is reported during post-deploy verification.
WITH roster(email, name, match_name) AS (
VALUES
  ('aaryan.bansal2027@mastersunion.org', 'Aaryan Bansal', 'Aaryan Bansal'),
  ('abhishek.borade2027@mastersunion.org', 'Abhishek Borade', 'Abhishek Borade'),
  ('adarsh.raj2027@mastersunion.org', 'Adarsh Raj', 'Adarsh Raj'),
  ('aditya.chauhan2027@mastersunion.org', 'Aditya Chauhan', 'Aditya Chauhan'),
  ('aditya.jain2027@mastersunion.org', 'Aditya Jain', 'Aditya Jain'),
  ('aekansh.panhotra2027@mastersunion.org', 'Aekansh Panhotra', 'Aekansh Panhotra'),
  ('akshay.wilson2027@mastersunion.org', 'Akshay  Wilson', 'Akshay  Wilson'),
  ('akshit.nag2027@mastersunion.org', 'Akshit Nag', 'Akshit Nag'),
  ('anany.dixit2027@mastersunion.org', 'Anany Dixit', 'Anany Dixit'),
  ('anisha.uppal2027@mastersunion.org', 'Anisha Uppal', 'Anisha Uppal'),
  ('ankit.singhal2027@mastersunion.org', 'Ankit Singhal', 'Ankit Singhal'),
  ('ansh.arora2028@mastersunion.org', 'Ansh Arora', 'Ansh Arora'),
  ('anushka.kothari2028@mastersunion.org', 'Anushka Kothari', 'Anushka Kothari'),
  ('arshia.gupta2027@mastersunion.org', 'Arshia Gupta', 'Arshia Gupta'),
  ('aryan.singh2027@mastersunion.org', 'Aryan Singh', 'Aryan Singh'),
  ('aryan.thapar2028@mastersunion.org', 'Aryan Thapar', 'Aryan Thapar'),
  ('ashray2027@mastersunion.org', 'Ashray', 'Ashray'),
  ('ashu.bhatia2027@mastersunion.org', 'Ashu Bhatia', 'Ashu Bhatia'),
  ('aswin.dg2028@mastersunion.org', 'Aswin Dg', 'Aswin Dg'),
  ('avinashdev.garudapalli2027@mastersunion.org', 'Avinashdev Garudapalli', 'Avinashdev Garudapalli'),
  ('ayush.garg2027@mastersunion.org', 'Ayush Garg', 'Ayush Garg'),
  ('ayush.vaidya2028@mastersunion.org', 'Ayush Vaidya', 'Ayush Vaidya'),
  ('bipasha.das2027@mastersunion.org', 'Bipasha Das', 'Bipasha Das'),
  ('eva.goyal2028@mastersunion.org', 'Eva Goyal', 'Eva Goyal'),
  ('harish.kumar2027@mastersunion.org', 'Harish S Kumar', 'Harish S Kumar'),
  ('harshit.mittal2028@mastersunion.org', 'Harshit Mittal', 'Harshit Mittal'),
  ('hemakumari.nadella2027@mastersunion.org', 'Hemakumari Nadella', 'Hemakumari Nadella'),
  ('janvi.arora2027@mastersunion.org', 'Janvi Arora', 'Janvi Arora'),
  ('jyoti.singh2027@mastersunion.org', 'Jyoti Kumari Singh', 'Jyoti Kumari Singh'),
  ('krutarth.kotnis2027@mastersunion.org', 'Krutarth Kaustubh Kotnis', 'Krutarth Kaustubh Kotnis'),
  ('kushal.sethia2027@mastersunion.org', 'Kushal Sethia', 'Kushal Sethia'),
  ('lalith.thota2027@mastersunion.org', 'Lalith Thota', 'Lalith Thota'),
  ('manishka.mathur2027@mastersunion.org', 'Manishka Mathur', 'Manishka Mathur'),
  ('mannat.randhawa2027@mastersunion.org', 'Mannat Kaur Randhawa', 'Mannat Kaur Randhawa'),
  ('mansi.nerkar2027@mastersunion.org', 'Mansi Hemant Nerkar', 'Mansi Hemant Nerkar'),
  ('manvi.narang2027@mastersunion.org', 'Manvi Narang', 'Manvi Narang'),
  ('nalini.jain2028@mastersunion.org', 'Nalini Jain', 'Nalini Jain'),
  ('navya.juneja2027@mastersunion.org', 'Navya Juneja', 'Navya Juneja'),
  ('nikhil.rudra2028@mastersunion.org', 'Nikhil Rudra H P', 'Nikhil Rudra H P'),
  ('ojasvita.dabas2027@mastersunion.org', 'Ojasvita Dabas', 'Ojasvita Dabas'),
  ('pragya.rathi2027@mastersunion.org', 'Pragya Rathi', 'Pragya Rathi'),
  ('prakhar.murary2027@mastersunion.org', 'Prakhar Murary', 'Prakhar Murary'),
  ('prakriti.sharda2027@mastersunion.org', 'Prakriti Sharda', 'Prakriti Sharda'),
  ('preksha.rathi2027@mastersunion.org', 'Preksha Rathi', 'Preksha Rathi'),
  ('purnisha.tomar2027@mastersunion.org', 'Purnisha Tomar', 'Purnisha Tomar'),
  ('rashi.arora2027@mastersunion.org', 'Rashi Arora', 'Rashi Arora'),
  ('riddhi.singla2028@mastersunion.org', 'Riddhi Singla', 'Riddhi Singla'),
  ('rishabh.kamath2027@mastersunion.org', 'Rishabh Laxminarayan Kamath', 'Rishabh Laxminarayan Kamath'),
  ('sanya.bansal2028@mastersunion.org', 'Sanya Bansal', 'Sanya Bansal'),
  ('shaezan.shah2027@mastersunion.org', 'Shaezan Shah', 'Shaezan Shah'),
  ('shikhar.verma2027@mastersunion.org', 'Shikhar Verma', 'Shikhar Verma'),
  ('soham.dhamnaskar2027@mastersunion.org', 'Soham Dhamnaskar', 'Soham Dhamnaskar'),
  ('srijoni.sanyal2027@mastersunion.org', 'Srijoni Sanyal', 'Srijoni Sanyal'),
  ('suyash.kabra2028@mastersunion.org', 'Suyash Manoj Kabra', 'Suyash Manoj Kabra'),
  ('swatantra.soni2027@mastersunion.org', 'Swatantra Kumar Soni', 'Swatantra Kumar Soni'),
  ('tarisha.agarwal2027@mastersunion.org', 'Tarisha Agarwal', 'Tarisha Agarwal'),
  ('utkarsh.kushwaha2027@mastersunion.org', 'Utkarsh Kushwaha', 'Utkarsh Kushwaha'),
  ('vansh.sharma2027@mastersunion.org', 'Mr Vansh Sharma', 'Mr Vansh Sharma'),
  ('vasudha.jajodia2027@mastersunion.org', 'Vasudha Jaodia', 'Vasudha Jajodia'),
  ('', 'Srishti Sharma', 'Srishti Sharma')
)
INSERT INTO "UserEmailAlias" ("email", "userId")
SELECT r.email, u.id
FROM roster r
JOIN "Section" s ON s.code = 'F'
JOIN "User" u ON u."sectionId" = s.id AND lower(regexp_replace(trim(u.name), '[^a-zA-Z0-9]+', ' ', 'g')) = lower(regexp_replace(trim(r.match_name), '[^a-zA-Z0-9]+', ' ', 'g'))
WHERE r.email <> '' AND lower(u.email) <> r.email
ON CONFLICT ("email") DO NOTHING;

WITH roster(email, name, match_name) AS (
VALUES
  ('aaryan.bansal2027@mastersunion.org', 'Aaryan Bansal', 'Aaryan Bansal'),
  ('abhishek.borade2027@mastersunion.org', 'Abhishek Borade', 'Abhishek Borade'),
  ('adarsh.raj2027@mastersunion.org', 'Adarsh Raj', 'Adarsh Raj'),
  ('aditya.chauhan2027@mastersunion.org', 'Aditya Chauhan', 'Aditya Chauhan'),
  ('aditya.jain2027@mastersunion.org', 'Aditya Jain', 'Aditya Jain'),
  ('aekansh.panhotra2027@mastersunion.org', 'Aekansh Panhotra', 'Aekansh Panhotra'),
  ('akshay.wilson2027@mastersunion.org', 'Akshay  Wilson', 'Akshay  Wilson'),
  ('akshit.nag2027@mastersunion.org', 'Akshit Nag', 'Akshit Nag'),
  ('anany.dixit2027@mastersunion.org', 'Anany Dixit', 'Anany Dixit'),
  ('anisha.uppal2027@mastersunion.org', 'Anisha Uppal', 'Anisha Uppal'),
  ('ankit.singhal2027@mastersunion.org', 'Ankit Singhal', 'Ankit Singhal'),
  ('ansh.arora2028@mastersunion.org', 'Ansh Arora', 'Ansh Arora'),
  ('anushka.kothari2028@mastersunion.org', 'Anushka Kothari', 'Anushka Kothari'),
  ('arshia.gupta2027@mastersunion.org', 'Arshia Gupta', 'Arshia Gupta'),
  ('aryan.singh2027@mastersunion.org', 'Aryan Singh', 'Aryan Singh'),
  ('aryan.thapar2028@mastersunion.org', 'Aryan Thapar', 'Aryan Thapar'),
  ('ashray2027@mastersunion.org', 'Ashray', 'Ashray'),
  ('ashu.bhatia2027@mastersunion.org', 'Ashu Bhatia', 'Ashu Bhatia'),
  ('aswin.dg2028@mastersunion.org', 'Aswin Dg', 'Aswin Dg'),
  ('avinashdev.garudapalli2027@mastersunion.org', 'Avinashdev Garudapalli', 'Avinashdev Garudapalli'),
  ('ayush.garg2027@mastersunion.org', 'Ayush Garg', 'Ayush Garg'),
  ('ayush.vaidya2028@mastersunion.org', 'Ayush Vaidya', 'Ayush Vaidya'),
  ('bipasha.das2027@mastersunion.org', 'Bipasha Das', 'Bipasha Das'),
  ('eva.goyal2028@mastersunion.org', 'Eva Goyal', 'Eva Goyal'),
  ('harish.kumar2027@mastersunion.org', 'Harish S Kumar', 'Harish S Kumar'),
  ('harshit.mittal2028@mastersunion.org', 'Harshit Mittal', 'Harshit Mittal'),
  ('hemakumari.nadella2027@mastersunion.org', 'Hemakumari Nadella', 'Hemakumari Nadella'),
  ('janvi.arora2027@mastersunion.org', 'Janvi Arora', 'Janvi Arora'),
  ('jyoti.singh2027@mastersunion.org', 'Jyoti Kumari Singh', 'Jyoti Kumari Singh'),
  ('krutarth.kotnis2027@mastersunion.org', 'Krutarth Kaustubh Kotnis', 'Krutarth Kaustubh Kotnis'),
  ('kushal.sethia2027@mastersunion.org', 'Kushal Sethia', 'Kushal Sethia'),
  ('lalith.thota2027@mastersunion.org', 'Lalith Thota', 'Lalith Thota'),
  ('manishka.mathur2027@mastersunion.org', 'Manishka Mathur', 'Manishka Mathur'),
  ('mannat.randhawa2027@mastersunion.org', 'Mannat Kaur Randhawa', 'Mannat Kaur Randhawa'),
  ('mansi.nerkar2027@mastersunion.org', 'Mansi Hemant Nerkar', 'Mansi Hemant Nerkar'),
  ('manvi.narang2027@mastersunion.org', 'Manvi Narang', 'Manvi Narang'),
  ('nalini.jain2028@mastersunion.org', 'Nalini Jain', 'Nalini Jain'),
  ('navya.juneja2027@mastersunion.org', 'Navya Juneja', 'Navya Juneja'),
  ('nikhil.rudra2028@mastersunion.org', 'Nikhil Rudra H P', 'Nikhil Rudra H P'),
  ('ojasvita.dabas2027@mastersunion.org', 'Ojasvita Dabas', 'Ojasvita Dabas'),
  ('pragya.rathi2027@mastersunion.org', 'Pragya Rathi', 'Pragya Rathi'),
  ('prakhar.murary2027@mastersunion.org', 'Prakhar Murary', 'Prakhar Murary'),
  ('prakriti.sharda2027@mastersunion.org', 'Prakriti Sharda', 'Prakriti Sharda'),
  ('preksha.rathi2027@mastersunion.org', 'Preksha Rathi', 'Preksha Rathi'),
  ('purnisha.tomar2027@mastersunion.org', 'Purnisha Tomar', 'Purnisha Tomar'),
  ('rashi.arora2027@mastersunion.org', 'Rashi Arora', 'Rashi Arora'),
  ('riddhi.singla2028@mastersunion.org', 'Riddhi Singla', 'Riddhi Singla'),
  ('rishabh.kamath2027@mastersunion.org', 'Rishabh Laxminarayan Kamath', 'Rishabh Laxminarayan Kamath'),
  ('sanya.bansal2028@mastersunion.org', 'Sanya Bansal', 'Sanya Bansal'),
  ('shaezan.shah2027@mastersunion.org', 'Shaezan Shah', 'Shaezan Shah'),
  ('shikhar.verma2027@mastersunion.org', 'Shikhar Verma', 'Shikhar Verma'),
  ('soham.dhamnaskar2027@mastersunion.org', 'Soham Dhamnaskar', 'Soham Dhamnaskar'),
  ('srijoni.sanyal2027@mastersunion.org', 'Srijoni Sanyal', 'Srijoni Sanyal'),
  ('suyash.kabra2028@mastersunion.org', 'Suyash Manoj Kabra', 'Suyash Manoj Kabra'),
  ('swatantra.soni2027@mastersunion.org', 'Swatantra Kumar Soni', 'Swatantra Kumar Soni'),
  ('tarisha.agarwal2027@mastersunion.org', 'Tarisha Agarwal', 'Tarisha Agarwal'),
  ('utkarsh.kushwaha2027@mastersunion.org', 'Utkarsh Kushwaha', 'Utkarsh Kushwaha'),
  ('vansh.sharma2027@mastersunion.org', 'Mr Vansh Sharma', 'Mr Vansh Sharma'),
  ('vasudha.jajodia2027@mastersunion.org', 'Vasudha Jaodia', 'Vasudha Jajodia'),
  ('', 'Srishti Sharma', 'Srishti Sharma')
)
INSERT INTO "User" (id, email, name, role, "sectionId", "flaggedForDeletion", "createdAt")
SELECT 'roster_' || md5(r.email), r.email, r.name, 'student'::"Role", s.id, false, CURRENT_TIMESTAMP
FROM roster r
JOIN "Section" s ON s.code = 'F'
WHERE r.email <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."sectionId" = s.id AND lower(regexp_replace(trim(u.name), '[^a-zA-Z0-9]+', ' ', 'g')) = lower(regexp_replace(trim(r.match_name), '[^a-zA-Z0-9]+', ' ', 'g'))
  )
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE lower(u.email) = r.email);

-- Section G: these are replacement roster emails, so update the existing
-- student row in place (preserving all work) and create genuinely new rows.
WITH roster(email, name, match_name) AS (
VALUES
  ('aadi.jain2027@mastersunion.org', 'Aadi Jain', 'Aadi Jain'),
  ('aakrishtkalra1999@gmail.com', 'Aakrisht Kalra', 'Aakrisht Kalra'),
  ('abhinav.dua2027@mastersunion.org', 'Abhinav Dua', 'Abhinav Dua'),
  ('adithya.ramraj2028@mastersunion.org', 'Adithya Ramraj', 'Adithya Ramraj'),
  ('aditya.teotia2027@mastersunion.org', 'Aditya Teotia', 'Aditya Teotia'),
  ('akash.borkar2027@mastersunion.org', 'Akash Prakash Borkar', 'Akash Prakash Borkar'),
  ('akshat.dhaundiyal2027@mastersunion.org', 'Akshat Dhaundiyal', 'Akshat Dhaundiyal'),
  ('ankush.daga2027@mastersunion.org', 'Ankush Ajay Daga', 'Ankush Ajay Daga'),
  ('anushka.magon2028@mastersunion.org', 'Anushka Magon', 'Anushka Magon'),
  ('anushree.mukherjee2027@mastersunion.org', 'Anushree Mukherjee', 'Anushree Mukherjee'),
  ('arth.singhal2027@mastersunion.org', 'Arth Singhal', 'Arth Singhal'),
  ('aryan.bang2028@mastersunion.org', 'Aryan Bang', 'Aryan Bang'),
  ('aryan.salooja2028@mastersunion.org', 'Aryan Salooja', 'Aryan Salooja'),
  ('ashni.prabhu2027@mastersunion.org', 'Ashni Prabhu', 'Ashni Prabhu'),
  ('athrv.thakuria2027@mastersunion.org', 'Athrv Thakuria', 'Athrv Thakuria'),
  ('ayushi.uniyal2027@mastersunion.org', 'Ayushi Uniyal', 'Ayushi Uniyal'),
  ('bhavya.jain2027@mastersunion.org', 'Bhavya Jain', 'Bhavya Jain'),
  ('bhavya.tuteja2027@mastersunion.org', 'Bhavya Tuteja', 'Bhavya Tuteja'),
  ('deepanshu.gupta2027@mastersunion.org', 'Deepanshu Gupta', 'Deepanshu Gupta'),
  ('diksha.matia2027@mastersunion.org', 'Diksha Matia', 'Diksha Matia'),
  ('dimpy.yadav2027@mastersunion.org', 'Dimpy Yadav', 'Dimpy Yadav'),
  ('harith.bairagoni2027@mastersunion.org', 'Harith Bairagoni', 'Harith Bairagoni'),
  ('harnoor.kaur2027@mastersunion.org', 'Harnoor Kaur Dhanjal', 'Harnoor Kaur Dhanjal'),
  ('hemakshi.mehndiratta2028@mastersunion.org', 'Hemakshi Mehndiratta', 'Hemakshi Mehndiratta'),
  ('hridyansh.sandilya2028@mastersunion.org', 'Hridyansh Sandilya', 'Hridyansh Sandilya'),
  ('jahanvi.chadha2027@mastersunion.org', 'Jahanvi Chadha', 'Jahanvi Chadha'),
  ('jannat.khurana2028@mastersunion.org', 'Jannat Khurana', 'Jannat Khurana'),
  ('jivesh.shukla2027@mastersunion.org', 'Jivesh Shukla', 'Jivesh Shukla'),
  ('kush.sarna2027@mastersunion.org', 'Kush Sarna', 'Kush Sarna'),
  ('madhav.acharya2027@mastersunion.org', 'Madhav Acharya', 'Madhav Acharya'),
  ('maithily.thakur2027@mastersunion.org', 'Maithily Thakur', 'Maithily Thakur'),
  ('mansi.malhotra2028@mastersunion.org', 'Mansi Malhotra', 'Mansi Malhotra'),
  ('mohak.bansall2027@mastersunion.org', 'Mohak Bansall', 'Mohak Bansall'),
  ('navnidh.kaur2027@mastersunion.org', 'Navnidh Kaur', 'Navnidh Kaur'),
  ('nikhil.lall2027@mastersunion.org', 'Nikhil Lall', 'Nikhil Lall'),
  ('parth.goel2028@mastersunion.org', 'Parth Goel', 'Parth Goel'),
  ('pradyun.khanduja2027@mastersunion.org', 'Pradyun Khanduja', 'Pradyun Khanduja'),
  ('pratham.mohanty2028@mastersunion.org', 'Pratham Prateek Mohanty', 'Pratham Prateek Mohanty'),
  ('priyanka.periwal2027@mastersunion.org', 'Priyanka Periwal', 'Priyanka Periwal'),
  ('rehan.khodaiji2027@mastersunion.org', 'Rehan Khodaiji', 'Rehan Khodaiji'),
  ('rhythm2027@mastersunion.org', 'K Rhythm', 'K Rhythm'),
  ('riddhi.mohindra2028@mastersunion.org', 'Riddhi Mohindra', 'Riddhi Mohindra'),
  ('rishabh.bhandari2027@mastersunion.org', 'Rishabh Bhandari', 'Rishabh Bhandari'),
  ('rohan.abraham2027@mastersunion.org', 'Rohan Abraham', 'Rohan Abraham'),
  ('rucha.khandagale2027@mastersunion.org', 'Rucha Khandagale', 'Rucha Khandagale'),
  ('sahira2027@mastersunion.org', 'Sahira', 'Sahira'),
  ('sakshi.agarwal2027@mastersunion.org', 'Sakshi Agarwal', 'Sakshi Agarwal'),
  ('sameeksha.nigam2027@mastersunion.org', 'Sameeksha Nigam', 'Sameeksha Nigam'),
  ('sarvagya.agarwal2027@mastersunion.org', 'Sarvagya Agarwal', 'Sarvagya Agarwal'),
  ('sattyam.khandelwal2028@mastersunion.org', 'Sattyam Khandelwal', 'Sattyam Khandelwal'),
  ('saurav.kumar2027@mastersunion.org', 'Saurav Kumar', 'Saurav Kumar'),
  ('shivang.chaudhary2027@mastersunion.org', 'Shivang Chaudhary', 'Shivang Chaudhary'),
  ('soham.khatri2027@mastersunion.org', 'Soham Khatri', 'Soham Khatri'),
  ('soumya.khandelwal2027@mastersunion.org', 'Soumya Khandelwal', 'Soumya Khandelwal'),
  ('tirth.shah2028@mastersunion.org', 'Tirth Shah', 'Tirth Shah'),
  ('twinkle.monga2027@mastersunion.org', 'Twinkle Monga', 'Twinkle Monga'),
  ('utkarsh.garg2027@mastersunion.org', 'Utkarsh Garg', 'Utkarsh Garg'),
  ('uttiya.biswas2027@mastersunion.org', 'Uttiya Biswas', 'Uttiya Biswas'),
  ('vansh.arora2027@mastersunion.org', '', 'Vansh Arora')
)
UPDATE "User" u
SET email = r.email
FROM roster r, "Section" s
WHERE s.code = 'G' AND u."sectionId" = s.id
  AND r.email <> '' AND lower(regexp_replace(trim(u.name), '[^a-zA-Z0-9]+', ' ', 'g')) = lower(regexp_replace(trim(r.match_name), '[^a-zA-Z0-9]+', ' ', 'g'));

WITH roster(email, name, match_name) AS (
VALUES
  ('aadi.jain2027@mastersunion.org', 'Aadi Jain', 'Aadi Jain'),
  ('aakrishtkalra1999@gmail.com', 'Aakrisht Kalra', 'Aakrisht Kalra'),
  ('abhinav.dua2027@mastersunion.org', 'Abhinav Dua', 'Abhinav Dua'),
  ('adithya.ramraj2028@mastersunion.org', 'Adithya Ramraj', 'Adithya Ramraj'),
  ('aditya.teotia2027@mastersunion.org', 'Aditya Teotia', 'Aditya Teotia'),
  ('akash.borkar2027@mastersunion.org', 'Akash Prakash Borkar', 'Akash Prakash Borkar'),
  ('akshat.dhaundiyal2027@mastersunion.org', 'Akshat Dhaundiyal', 'Akshat Dhaundiyal'),
  ('ankush.daga2027@mastersunion.org', 'Ankush Ajay Daga', 'Ankush Ajay Daga'),
  ('anushka.magon2028@mastersunion.org', 'Anushka Magon', 'Anushka Magon'),
  ('anushree.mukherjee2027@mastersunion.org', 'Anushree Mukherjee', 'Anushree Mukherjee'),
  ('arth.singhal2027@mastersunion.org', 'Arth Singhal', 'Arth Singhal'),
  ('aryan.bang2028@mastersunion.org', 'Aryan Bang', 'Aryan Bang'),
  ('aryan.salooja2028@mastersunion.org', 'Aryan Salooja', 'Aryan Salooja'),
  ('ashni.prabhu2027@mastersunion.org', 'Ashni Prabhu', 'Ashni Prabhu'),
  ('athrv.thakuria2027@mastersunion.org', 'Athrv Thakuria', 'Athrv Thakuria'),
  ('ayushi.uniyal2027@mastersunion.org', 'Ayushi Uniyal', 'Ayushi Uniyal'),
  ('bhavya.jain2027@mastersunion.org', 'Bhavya Jain', 'Bhavya Jain'),
  ('bhavya.tuteja2027@mastersunion.org', 'Bhavya Tuteja', 'Bhavya Tuteja'),
  ('deepanshu.gupta2027@mastersunion.org', 'Deepanshu Gupta', 'Deepanshu Gupta'),
  ('diksha.matia2027@mastersunion.org', 'Diksha Matia', 'Diksha Matia'),
  ('dimpy.yadav2027@mastersunion.org', 'Dimpy Yadav', 'Dimpy Yadav'),
  ('harith.bairagoni2027@mastersunion.org', 'Harith Bairagoni', 'Harith Bairagoni'),
  ('harnoor.kaur2027@mastersunion.org', 'Harnoor Kaur Dhanjal', 'Harnoor Kaur Dhanjal'),
  ('hemakshi.mehndiratta2028@mastersunion.org', 'Hemakshi Mehndiratta', 'Hemakshi Mehndiratta'),
  ('hridyansh.sandilya2028@mastersunion.org', 'Hridyansh Sandilya', 'Hridyansh Sandilya'),
  ('jahanvi.chadha2027@mastersunion.org', 'Jahanvi Chadha', 'Jahanvi Chadha'),
  ('jannat.khurana2028@mastersunion.org', 'Jannat Khurana', 'Jannat Khurana'),
  ('jivesh.shukla2027@mastersunion.org', 'Jivesh Shukla', 'Jivesh Shukla'),
  ('kush.sarna2027@mastersunion.org', 'Kush Sarna', 'Kush Sarna'),
  ('madhav.acharya2027@mastersunion.org', 'Madhav Acharya', 'Madhav Acharya'),
  ('maithily.thakur2027@mastersunion.org', 'Maithily Thakur', 'Maithily Thakur'),
  ('mansi.malhotra2028@mastersunion.org', 'Mansi Malhotra', 'Mansi Malhotra'),
  ('mohak.bansall2027@mastersunion.org', 'Mohak Bansall', 'Mohak Bansall'),
  ('navnidh.kaur2027@mastersunion.org', 'Navnidh Kaur', 'Navnidh Kaur'),
  ('nikhil.lall2027@mastersunion.org', 'Nikhil Lall', 'Nikhil Lall'),
  ('parth.goel2028@mastersunion.org', 'Parth Goel', 'Parth Goel'),
  ('pradyun.khanduja2027@mastersunion.org', 'Pradyun Khanduja', 'Pradyun Khanduja'),
  ('pratham.mohanty2028@mastersunion.org', 'Pratham Prateek Mohanty', 'Pratham Prateek Mohanty'),
  ('priyanka.periwal2027@mastersunion.org', 'Priyanka Periwal', 'Priyanka Periwal'),
  ('rehan.khodaiji2027@mastersunion.org', 'Rehan Khodaiji', 'Rehan Khodaiji'),
  ('rhythm2027@mastersunion.org', 'K Rhythm', 'K Rhythm'),
  ('riddhi.mohindra2028@mastersunion.org', 'Riddhi Mohindra', 'Riddhi Mohindra'),
  ('rishabh.bhandari2027@mastersunion.org', 'Rishabh Bhandari', 'Rishabh Bhandari'),
  ('rohan.abraham2027@mastersunion.org', 'Rohan Abraham', 'Rohan Abraham'),
  ('rucha.khandagale2027@mastersunion.org', 'Rucha Khandagale', 'Rucha Khandagale'),
  ('sahira2027@mastersunion.org', 'Sahira', 'Sahira'),
  ('sakshi.agarwal2027@mastersunion.org', 'Sakshi Agarwal', 'Sakshi Agarwal'),
  ('sameeksha.nigam2027@mastersunion.org', 'Sameeksha Nigam', 'Sameeksha Nigam'),
  ('sarvagya.agarwal2027@mastersunion.org', 'Sarvagya Agarwal', 'Sarvagya Agarwal'),
  ('sattyam.khandelwal2028@mastersunion.org', 'Sattyam Khandelwal', 'Sattyam Khandelwal'),
  ('saurav.kumar2027@mastersunion.org', 'Saurav Kumar', 'Saurav Kumar'),
  ('shivang.chaudhary2027@mastersunion.org', 'Shivang Chaudhary', 'Shivang Chaudhary'),
  ('soham.khatri2027@mastersunion.org', 'Soham Khatri', 'Soham Khatri'),
  ('soumya.khandelwal2027@mastersunion.org', 'Soumya Khandelwal', 'Soumya Khandelwal'),
  ('tirth.shah2028@mastersunion.org', 'Tirth Shah', 'Tirth Shah'),
  ('twinkle.monga2027@mastersunion.org', 'Twinkle Monga', 'Twinkle Monga'),
  ('utkarsh.garg2027@mastersunion.org', 'Utkarsh Garg', 'Utkarsh Garg'),
  ('uttiya.biswas2027@mastersunion.org', 'Uttiya Biswas', 'Uttiya Biswas'),
  ('vansh.arora2027@mastersunion.org', '', 'Vansh Arora')
)
INSERT INTO "User" (id, email, name, role, "sectionId", "flaggedForDeletion", "createdAt")
SELECT 'roster_' || md5(r.email), r.email, r.name, 'student'::"Role", s.id, false, CURRENT_TIMESTAMP
FROM roster r
JOIN "Section" s ON s.code = 'G'
WHERE r.email <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."sectionId" = s.id AND lower(regexp_replace(trim(u.name), '[^a-zA-Z0-9]+', ' ', 'g')) = lower(regexp_replace(trim(r.match_name), '[^a-zA-Z0-9]+', ' ', 'g'))
  )
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE lower(u.email) = r.email);

-- Fail closed if production drift or a source-name mismatch changed the
-- reviewed reconciliation. PostgreSQL rolls every DDL and data write back.
DO $$
DECLARE
  f_users integer;
  f_aliases integer;
  f_company_primary integer;
  g_users integer;
BEGIN
  SELECT count(*) INTO f_users
  FROM "User" u JOIN "Section" s ON s.id = u."sectionId"
  WHERE s.code = 'F';

  SELECT count(*) INTO f_aliases
  FROM "UserEmailAlias" a
  JOIN "User" u ON u.id = a."userId"
  JOIN "Section" s ON s.id = u."sectionId"
  WHERE s.code = 'F';

  SELECT count(*) INTO f_company_primary
  FROM "User" u JOIN "Section" s ON s.id = u."sectionId"
  WHERE s.code = 'F' AND lower(u.email) LIKE '%@mastersunion.org';

  SELECT count(*) INTO g_users
  FROM "User" u JOIN "Section" s ON s.id = u."sectionId"
  WHERE s.code = 'G';

  IF f_users <> 59 OR f_aliases <> 56 OR f_company_primary <> 3 OR g_users <> 59 THEN
    RAISE EXCEPTION 'roster reconciliation mismatch: F users %, F aliases %, F new %, G users %',
      f_users, f_aliases, f_company_primary, g_users;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "User" u JOIN "Section" s ON s.id = u."sectionId"
    WHERE s.code IN ('F', 'G') AND trim(u.name) = ''
  ) THEN
    RAISE EXCEPTION 'roster reconciliation produced a blank student name';
  END IF;
END;
$$;

COMMIT;
