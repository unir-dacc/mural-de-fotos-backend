-- CreateTable
CREATE TABLE "_PostTaggedUsers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PostTaggedUsers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PostTaggedUsers_B_index" ON "_PostTaggedUsers"("B");

-- AddForeignKey
ALTER TABLE "_PostTaggedUsers" ADD CONSTRAINT "_PostTaggedUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PostTaggedUsers" ADD CONSTRAINT "_PostTaggedUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
